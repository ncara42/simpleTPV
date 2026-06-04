import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import { StockService } from '../stock/stock.service.js';
import type { CreateTransferDto, ReceiveTransferDto } from './transfers.dto.js';

// Discrepancia de una línea recibida: recibido - enviado. Negativa = merma
// (recibido menos de lo enviado), positiva = exceso. Función pura, testeable.
export function computeDiscrepancy(quantitySent: number, quantityReceived: number): number {
  return Math.round((quantityReceived - quantitySent) * 1000) / 1000;
}

function includeLinesWithProduct() {
  return { lines: { include: { product: { select: { name: true, barcode: true } } } } };
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    private readonly stock: StockService,
  ) {}

  /**
   * Crea un traspaso en DRAFT con sus líneas (quantitySent). Valida que ambas
   * tiendas son del tenant y distintas. RLS + organizationId explícito.
   */
  async create(dto: CreateTransferDto, userId: string) {
    const tenant = requireTenant();
    if (dto.originStoreId === dto.destStoreId) {
      throw new BadRequestException('Origen y destino deben ser tiendas distintas');
    }

    // Ambas tiendas deben existir en el tenant (RLS ya filtra por organización).
    const stores = await this.prisma.store.findMany({
      where: {
        id: { in: [dto.originStoreId, dto.destStoreId] },
        organizationId: tenant.organizationId,
      },
      select: { id: true },
    });
    if (stores.length !== 2) {
      throw new BadRequestException('Origen o destino no pertenecen a la organización');
    }

    return this.prisma.transfer.create({
      data: {
        organizationId: tenant.organizationId,
        originStoreId: dto.originStoreId,
        destStoreId: dto.destStoreId,
        createdBy: userId,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        lines: {
          create: dto.lines.map((l) => ({
            organizationId: tenant.organizationId,
            productId: l.productId,
            quantitySent: l.quantitySent,
          })),
        },
      },
      include: includeLinesWithProduct(),
    });
  }

  /**
   * Envía un traspaso (DRAFT → SENT): decrementa el stock del ORIGEN por cada
   * línea (movimiento TRANSFER_OUT) y marca sentAt. La transición es atómica y
   * condicional al estado DRAFT (updateMany), de modo que dos envíos concurrentes
   * no pueden ambos tener éxito (el segundo afecta 0 filas).
   */
  async send(id: string, userId: string) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const transfer = await tx.transfer.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: includeLinesWithProduct(),
      });
      if (!transfer) {
        throw new NotFoundException(`Traspaso ${id} no encontrado`);
      }
      if (transfer.status !== 'DRAFT') {
        throw new ConflictException(`El traspaso no está en DRAFT (estado: ${transfer.status})`);
      }

      const updated = await tx.transfer.updateMany({
        where: { id, organizationId: tenant.organizationId, status: 'DRAFT' },
        data: { status: 'SENT', sentAt: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('El traspaso ya fue enviado');
      }

      // Decrementa el stock del origen por lo enviado (TRANSFER_OUT, negativo).
      for (const line of transfer.lines) {
        await this.stock.applyMovement(
          tx,
          {
            organizationId: tenant.organizationId,
            productId: line.productId,
            storeId: transfer.originStoreId,
            type: 'TRANSFER_OUT',
            quantity: -Number(line.quantitySent),
            referenceId: transfer.id,
            userId,
          },
          afterCommit,
        );
      }

      return tx.transfer.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
        include: includeLinesWithProduct(),
      });
    });
  }

  /**
   * Recibe un traspaso (SENT → RECEIVED): registra quantityReceived por línea,
   * calcula la discrepancia (recibido - enviado) y nota opcional, e incrementa el
   * stock del DESTINO por lo realmente RECIBIDO (movimiento TRANSFER_IN). Marca
   * receivedAt. Transición atómica condicional al estado SENT.
   */
  async receive(id: string, dto: ReceiveTransferDto, userId: string, role: string) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const transfer = await tx.transfer.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: includeLinesWithProduct(),
      });
      if (!transfer) {
        throw new NotFoundException(`Traspaso ${id} no encontrado`);
      }
      if (transfer.status !== 'SENT') {
        throw new ConflictException(`El traspaso no está en SENT (estado: ${transfer.status})`);
      }
      // Aislamiento por tienda (SEC-01): un CLERK solo recibe traspasos en la
      // tienda de destino si está asignado a ella.
      await assertStoreAccess(tx, { userId, role, storeId: transfer.destStoreId });

      const linesById = new Map(transfer.lines.map((l) => [l.id, l]));
      // Toda línea del dto debe pertenecer al traspaso.
      for (const r of dto.lines) {
        if (!linesById.has(r.lineId)) {
          throw new BadRequestException(`La línea ${r.lineId} no pertenece al traspaso`);
        }
      }

      const updated = await tx.transfer.updateMany({
        where: { id, organizationId: tenant.organizationId, status: 'SENT' },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('El traspaso ya fue recibido');
      }

      for (const r of dto.lines) {
        const line = linesById.get(r.lineId)!;
        const discrepancy = computeDiscrepancy(Number(line.quantitySent), r.quantityReceived);
        await tx.transferLine.update({
          where: { id: line.id },
          data: {
            quantityReceived: r.quantityReceived,
            discrepancy,
            ...(r.discrepancyNote !== undefined ? { discrepancyNote: r.discrepancyNote } : {}),
          },
        });
        // Incrementa el stock del destino por lo RECIBIDO (no por lo enviado).
        if (r.quantityReceived > 0) {
          await this.stock.applyMovement(
            tx,
            {
              organizationId: tenant.organizationId,
              productId: line.productId,
              storeId: transfer.destStoreId,
              type: 'TRANSFER_IN',
              quantity: r.quantityReceived,
              referenceId: transfer.id,
              userId,
            },
            afterCommit,
          );
        }
      }

      return tx.transfer.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
        include: includeLinesWithProduct(),
      });
    });
  }

  /**
   * Cierra un traspaso (RECEIVED → CLOSED): estado final con trazabilidad. Marca
   * closedAt. Transición atómica condicional al estado RECEIVED.
   */
  async close(id: string) {
    const tenant = requireTenant();
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!transfer) {
      throw new NotFoundException(`Traspaso ${id} no encontrado`);
    }
    if (transfer.status !== 'RECEIVED') {
      throw new ConflictException(`El traspaso no está en RECEIVED (estado: ${transfer.status})`);
    }
    const updated = await this.prisma.transfer.updateMany({
      where: { id, organizationId: tenant.organizationId, status: 'RECEIVED' },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConflictException('El traspaso ya fue cerrado');
    }
    return this.prisma.transfer.findFirstOrThrow({
      where: { id, organizationId: tenant.organizationId },
      include: includeLinesWithProduct(),
    });
  }

  /** Listado de traspasos del tenant, filtrable por estado. */
  async list(status?: string) {
    const tenant = requireTenant();
    return this.prisma.transfer.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(status ? { status: status as 'DRAFT' | 'SENT' | 'RECEIVED' | 'CLOSED' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: includeLinesWithProduct(),
    });
  }

  /** Un traspaso del tenant con sus líneas. RLS + organizationId explícito. */
  async get(id: string) {
    const tenant = requireTenant();
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: includeLinesWithProduct(),
    });
    if (!transfer) {
      throw new NotFoundException(`Traspaso ${id} no encontrado`);
    }
    return transfer;
  }
}
