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
import type { CreatePurchaseOrderDto, SuggestPurchaseOrderDto } from './purchases.dto.js';

// Cantidad sugerida a pedir (#45). Cubre el mínimo más la demanda esperada
// durante el plazo de cobertura, descontando lo que ya hay. Nunca negativa.
// Función pura, testeable.
//   sugerida = max(0, minStock - stockActual + ventaMediaDiaria * diasCobertura)
export function suggestQuantity(
  minStock: number,
  stockActual: number,
  ventaMediaDiaria: number,
  diasCobertura: number,
): number {
  const raw = minStock - stockActual + ventaMediaDiaria * diasCobertura;
  return Math.max(0, Math.round(raw * 1000) / 1000);
}

const DEFAULT_DAYS_COVERAGE = 14;
const SALES_WINDOW_DAYS = 30;

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
}
