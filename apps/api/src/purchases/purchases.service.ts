import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreatePurchaseOrderDto } from './purchases.dto.js';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
  ) {}

  /**
   * Crea un pedido a proveedor en DRAFT con sus líneas. Valida que el proveedor
   * y la tienda destino pertenecen al tenant. RLS + organizationId explícito.
   */
  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const tenant = requireTenant();

    const [supplier, store] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, organizationId: tenant.organizationId },
      }),
      this.prisma.store.findFirst({
        where: { id: dto.storeId, organizationId: tenant.organizationId },
      }),
    ]);
    if (!supplier) {
      throw new BadRequestException('Proveedor no encontrado en la organización');
    }
    if (!store) {
      throw new BadRequestException('Tienda destino no encontrada en la organización');
    }

    return this.prisma.purchaseOrder.create({
      data: {
        organizationId: tenant.organizationId,
        supplierId: dto.supplierId,
        storeId: dto.storeId,
        createdBy: userId,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        lines: {
          create: dto.lines.map((l) => ({
            organizationId: tenant.organizationId,
            productId: l.productId,
            quantityOrdered: l.quantityOrdered,
            ...(l.unitCost !== undefined ? { unitCost: l.unitCost } : {}),
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Listado de pedidos del tenant, filtrable por estado. */
  async list(status?: string) {
    const tenant = requireTenant();
    return this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(status
          ? { status: status as 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { lines: true, supplier: { select: { name: true, leadTimeDays: true } } },
    });
  }

  /** Un pedido del tenant con líneas y proveedor. RLS + organizationId explícito. */
  async get(id: string) {
    const tenant = requireTenant();
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: { lines: true, supplier: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${id} no encontrado`);
    }
    return order;
  }

  /**
   * Confirma un pedido (DRAFT → CONFIRMED). Transición atómica condicional al
   * estado (updateMany), como en traspasos: dos confirmaciones concurrentes no
   * pueden ambas tener éxito.
   */
  async confirm(id: string) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, organizationId: tenant.organizationId },
      });
      if (!order) {
        throw new NotFoundException(`Pedido ${id} no encontrado`);
      }
      if (order.status !== 'DRAFT') {
        throw new ConflictException(`El pedido no está en DRAFT (estado: ${order.status})`);
      }
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, organizationId: tenant.organizationId, status: 'DRAFT' },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('El pedido ya fue confirmado');
      }
      return tx.purchaseOrder.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
        include: { lines: true },
      });
    });
  }
}
