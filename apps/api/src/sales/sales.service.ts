import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMethod } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateSaleDto } from './sales.dto.js';

interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export function formatTicket(code: string, counter: number): string {
  return `T${code}-${String(counter).padStart(6, '0')}`;
}

// Redondeo a 2 decimales (céntimos) para que el cálculo coincida con la columna
// DECIMAL(12,2) y con el total que el TPV muestra al cobrar. Sin esto, el float
// de unitPrice*qty puede arrastrar imprecisión y divergir del cambio mostrado.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(lines: PricedLine[]): {
  lines: Array<PricedLine & { lineTotal: number }>;
  subtotal: number;
  total: number;
} {
  const priced = lines.map((l) => ({ ...l, lineTotal: round2(l.unitPrice * l.qty) }));
  const subtotal = round2(priced.reduce((acc, l) => acc + l.lineTotal, 0));
  return { lines: priced, subtotal, total: subtotal };
}

/**
 * Calcula el detalle de efectivo de una venta. Para CARD (o CASH sin importe
 * entregado) devuelve null/null. Para CASH con importe entregado calcula el
 * cambio (redondeado a 2 decimales) y rechaza si el efectivo es insuficiente.
 */
export function computeChange(
  paymentMethod: PaymentMethod,
  total: number,
  cashGiven: number | undefined,
): { cashGiven: number | null; cashChange: number | null } {
  if (paymentMethod !== 'CASH' || cashGiven === undefined) {
    return { cashGiven: null, cashChange: null };
  }
  if (cashGiven < total) {
    throw new BadRequestException('Efectivo insuficiente');
  }
  const cashChange = round2(cashGiven - total);
  return { cashGiven, cashChange };
}

@Injectable()
export class SalesService {
  constructor(
    // Extendido: lecturas con RLS por-operación (p.ej. findMany de productos).
    private readonly prisma: PrismaService,
    // Base: para withTenantTx, que abre UNA sola transacción atómica.
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
  ) {}

  async create(dto: CreateSaleDto, userId: string) {
    const tenant = requireTenant();

    // El cliente extendido ya aplica RLS por-operación: esta lectura solo ve
    // productos del tenant. Si falta alguno → error (no se mezcla con otro tenant).
    const ids = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const priced: PricedLine[] = dto.lines.map((l) => {
      const product = byId.get(l.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${l.productId} no encontrado`);
      }
      return {
        productId: l.productId,
        name: product.name,
        unitPrice: Number(product.salePrice),
        qty: l.qty,
      };
    });

    const { lines, subtotal, total } = computeTotals(priced);
    const { cashGiven, cashChange } = computeChange(dto.paymentMethod, total, dto.cashGiven);

    // Usamos el cliente BASE (sin extensiones) para que withTenantTx abra UNA
    // sola transacción: el incremento del contador (tx.$queryRaw) y la creación
    // de la venta (tx.sale.create) corren en la MISMA tx con el set_config LOCAL
    // aplicado. Pasar el extendido anidaría transacciones y rompería la
    // atomicidad (contador incrementado aunque la venta falle).
    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      const updated = await tx.$queryRaw<Array<{ code: string; ticketCounter: number }>>`
        UPDATE "Store" SET "ticketCounter" = "ticketCounter" + 1
        WHERE id = ${dto.storeId}::uuid
        RETURNING code, "ticketCounter"
      `;
      const store = updated[0];
      if (!store) {
        throw new NotFoundException(`Tienda ${dto.storeId} no encontrada`);
      }
      const ticketNumber = formatTicket(store.code, store.ticketCounter);

      // TODO: stock semana 3 — decrementar stock atómicamente aquí (no-op por ahora).

      return tx.sale.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: dto.storeId,
          userId,
          ticketNumber,
          subtotal,
          total,
          paymentMethod: dto.paymentMethod,
          cashGiven,
          cashChange,
          lines: {
            create: lines.map((l) => ({
              organizationId: tenant.organizationId,
              productId: l.productId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }
}
