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
import { StockService } from '../stock/stock.service.js';
import {
  DEFAULT_DAYS_COVERAGE,
  fillRate,
  leadTimeDays,
  SALES_WINDOW_DAYS,
  suggestQuantity,
} from './purchases.domain.js';
import type {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  SuggestPurchaseOrderDto,
} from './purchases.dto.js';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    // Para incrementar el stock del destino en la recepción (#46).
    private readonly stock: StockService,
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

  /**
   * Un pedido del tenant con líneas, proveedor y KPIs (lead time, fill rate).
   * RLS + organizationId explícito.
   */
  async get(id: string) {
    const tenant = requireTenant();
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: { lines: true, supplier: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${id} no encontrado`);
    }
    const ordered = order.lines.reduce((acc, l) => acc + Number(l.quantityOrdered), 0);
    const received = order.lines.reduce((acc, l) => acc + Number(l.quantityReceived), 0);
    return {
      ...order,
      kpis: {
        leadTimeDays: leadTimeDays(order.confirmedAt, order.receivedAt),
        fillRate: fillRate(ordered, received),
      },
    };
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

  /**
   * Propuesta de pedido para una tienda (#45). Por cada producto con stock en la
   * tienda calcula la cantidad sugerida y devuelve los datos de contexto que la
   * explican (stock actual, mínimo, venta media 30d, rotación, cobertura). La
   * venta media usa los movimientos SALE (salidas) de los últimos 30 días —
   * StockMovement ya excluye las ventas anuladas porque al anular se repone el
   * stock con un movimiento RETURN que no es SALE. RLS + organizationId explícito.
   */
  async suggest(dto: SuggestPurchaseOrderDto) {
    const tenant = requireTenant();
    const daysCoverage = dto.daysCoverage ?? DEFAULT_DAYS_COVERAGE;
    const since = new Date(Date.now() - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Stock de la tienda (cantidad y mínimo por producto).
    const stockRows = await this.prisma.stock.findMany({
      where: { storeId: dto.storeId, organizationId: tenant.organizationId },
      include: { product: { select: { name: true } } },
    });

    // Ventas (movimientos SALE) de los últimos 30 días en la tienda, agrupadas
    // por producto. quantity es negativo (salida); usamos el valor absoluto.
    const salesMovements = await this.prisma.stockMovement.findMany({
      where: {
        storeId: dto.storeId,
        organizationId: tenant.organizationId,
        type: 'SALE',
        createdAt: { gte: since },
      },
      select: { productId: true, quantity: true },
    });
    const soldByProduct = new Map<string, number>();
    for (const m of salesMovements) {
      soldByProduct.set(
        m.productId,
        (soldByProduct.get(m.productId) ?? 0) + Math.abs(Number(m.quantity)),
      );
    }

    const round3 = (n: number): number => Math.round(n * 1000) / 1000;

    return stockRows
      .map((row) => {
        const stockActual = Number(row.quantity);
        const minStock = Number(row.minStock);
        const sold30 = soldByProduct.get(row.productId) ?? 0;
        const ventaMediaDiaria = round3(sold30 / SALES_WINDOW_DAYS);
        const suggested = suggestQuantity(minStock, stockActual, ventaMediaDiaria, daysCoverage);
        return {
          productId: row.productId,
          productName: row.product.name,
          stockActual,
          minStock,
          ventaMedia30d: sold30,
          ventaMediaDiaria,
          rotacion: stockActual > 0 ? round3(ventaMediaDiaria / stockActual) : null,
          coberturaDias: ventaMediaDiaria > 0 ? round3(stockActual / ventaMediaDiaria) : null,
          cantidadSugerida: suggested,
        };
      })
      .filter((line) => line.cantidadSugerida > 0)
      .sort((a, b) => b.cantidadSugerida - a.cantidadSugerida);
  }

  /**
   * Exporta un pedido a CSV (#48): cabecera + una fila por línea (producto,
   * pedido, recibido, coste). RLS vía get(). Escapa comillas/comas básicas.
   */
  async exportCsv(id: string): Promise<string> {
    const order = await this.get(id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: order.lines.map((l) => l.productId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));
    const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

    const header = 'producto,cantidad_pedida,cantidad_recibida,coste_unitario';
    const rows = order.lines.map((l) =>
      [
        esc(nameById.get(l.productId) ?? l.productId),
        String(l.quantityOrdered),
        String(l.quantityReceived),
        l.unitCost != null ? String(l.unitCost) : '',
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Recibe un pedido (#46): registra la cantidad recibida por línea (acumulada),
   * incrementa el stock del destino con applyMovement tipo PURCHASE_RECEIPT, y
   * actualiza el estado: RECEIVED si todas las líneas alcanzan lo pedido,
   * PARTIALLY_RECEIVED si no. Permite recepciones sucesivas sin pasarse de lo
   * pedido. Atómico (withTenantTx); solo desde CONFIRMED o PARTIALLY_RECEIVED.
   */
  async receive(id: string, dto: ReceivePurchaseOrderDto, userId: string) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: { lines: true },
      });
      if (!order) {
        throw new NotFoundException(`Pedido ${id} no encontrado`);
      }
      if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_RECEIVED') {
        throw new ConflictException(
          `El pedido no admite recepción (estado: ${order.status}). Debe estar CONFIRMED.`,
        );
      }

      const linesById = new Map(order.lines.map((l) => [l.id, l]));
      // Valida que las líneas del dto pertenecen al pedido y no exceden lo pedido.
      for (const r of dto.lines) {
        const line = linesById.get(r.lineId);
        if (!line) {
          throw new BadRequestException(`La línea ${r.lineId} no pertenece al pedido`);
        }
        const already = Number(line.quantityReceived);
        const ordered = Number(line.quantityOrdered);
        if (already + r.quantityReceived > ordered) {
          throw new BadRequestException(
            `La línea ${r.lineId} recibiría más de lo pedido (pedido ${ordered}, ya ${already})`,
          );
        }
      }

      // Aplica la recepción línea a línea: acumula quantityReceived e incrementa
      // el stock del destino (PURCHASE_RECEIPT) por lo recibido en esta tanda.
      for (const r of dto.lines) {
        const line = linesById.get(r.lineId)!;
        if (r.quantityReceived <= 0) {
          continue;
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: { increment: r.quantityReceived } },
        });
        await this.stock.applyMovement(
          tx,
          {
            organizationId: tenant.organizationId,
            productId: line.productId,
            storeId: order.storeId,
            type: 'PURCHASE_RECEIPT',
            quantity: r.quantityReceived,
            referenceId: order.id,
            userId,
          },
          afterCommit,
        );
      }

      // Recalcula el estado: RECEIVED si toda línea alcanzó lo pedido.
      const fresh = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: id, organizationId: tenant.organizationId },
      });
      const complete = fresh.every((l) => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      await tx.purchaseOrder.update({
        where: { id },
        data: complete
          ? { status: 'RECEIVED', receivedAt: new Date() }
          : { status: 'PARTIALLY_RECEIVED' },
      });

      return tx.purchaseOrder.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
        include: { lines: true },
      });
    });
  }
}
