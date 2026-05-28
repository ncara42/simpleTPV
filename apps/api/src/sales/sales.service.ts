import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentMethod } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateSaleDto } from './sales.dto.js';

export type SaleRole = 'ADMIN' | 'MANAGER' | 'CLERK';

interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  // % de descuento de la línea (0–100). Ausente o 0 = sin descuento.
  discountPct?: number;
  // IVA del producto congelado en el momento de la venta.
  taxRate?: number;
}

interface TicketDiscount {
  ticketDiscountPct?: number;
  ticketDiscountAmt?: number;
}

interface ComputedLine extends PricedLine {
  // Importe bruto de la línea (unitPrice*qty) antes del descuento de línea.
  gross: number;
  // Importe del descuento de la línea (round2(gross * pct/100)).
  discountAmt: number;
  // Neto tras el descuento de línea (round2(gross - discountAmt)).
  lineTotal: number;
}

// Límite de % de descuento efectivo total del ticket por rol (null = sin límite).
export const DISCOUNT_LIMITS: Record<SaleRole, number | null> = {
  ADMIN: null,
  MANAGER: 50,
  CLERK: 10,
};

// Tolerancia para comparar floats: evita falsos positivos por imprecisión al
// calcular el % efectivo (p.ej. 10.0000000001% con límite 10%).
const LIMIT_EPSILON = 1e-6;

export function formatTicket(code: string, counter: number): string {
  return `T${code}-${String(counter).padStart(6, '0')}`;
}

// Redondeo a 2 decimales (céntimos) para que el cálculo coincida con la columna
// DECIMAL(12,2) y con el total que el TPV muestra al cobrar. Sin esto, el float
// de unitPrice*qty puede arrastrar imprecisión y divergir del cambio mostrado.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(
  lines: PricedLine[],
  ticket: TicketDiscount = {},
): {
  lines: ComputedLine[];
  subtotal: number;
  ticketDiscount: number;
  discountTotal: number;
  total: number;
} {
  // 1. Por línea: bruto, descuento de línea y neto. Todos los pasos con round2
  //    para que el cálculo coincida con la columna DECIMAL y con el TPV.
  const priced: ComputedLine[] = lines.map((l) => {
    const gross = round2(l.unitPrice * l.qty);
    const pct = l.discountPct ?? 0;
    const discountAmt = round2((gross * pct) / 100);
    const lineTotal = round2(gross - discountAmt);
    return { ...l, gross, discountAmt, lineTotal };
  });

  // 2. subtotal = Σ netos de línea (tras descuento de línea, antes del de ticket).
  const subtotal = round2(priced.reduce((acc, l) => acc + l.lineTotal, 0));

  // 3. Descuento de ticket: el importe fijo tiene precedencia sobre el %.
  //    El importe se capa al subtotal para que el total nunca sea negativo.
  let ticketDiscount = 0;
  if (ticket.ticketDiscountAmt !== undefined) {
    ticketDiscount = round2(Math.min(ticket.ticketDiscountAmt, subtotal));
  } else if (ticket.ticketDiscountPct !== undefined) {
    ticketDiscount = round2((subtotal * ticket.ticketDiscountPct) / 100);
  }

  // 4. discountTotal = Σ descuentos de línea + descuento de ticket.
  const lineDiscounts = round2(priced.reduce((acc, l) => acc + l.discountAmt, 0));
  const discountTotal = round2(lineDiscounts + ticketDiscount);

  // 5. total = subtotal − descuento de ticket.
  const total = round2(subtotal - ticketDiscount);

  return { lines: priced, subtotal, ticketDiscount, discountTotal, total };
}

/**
 * Verifica que el % de descuento efectivo total del ticket no supere el límite
 * del rol. El % efectivo = discountTotal / grossTotal × 100 (grossTotal = suma
 * de unitPrice*qty sin descuentos). Lanza ForbiddenException (403) si lo supera.
 * Con grossTotal 0 (carrito vacío de importe) no hay descuento posible → no-op.
 */
export function assertDiscountWithinRoleLimit(
  role: SaleRole,
  discountTotal: number,
  grossTotal: number,
): void {
  const limit = DISCOUNT_LIMITS[role];
  if (limit === null || grossTotal <= 0) {
    return;
  }
  const effectivePct = (discountTotal / grossTotal) * 100;
  if (effectivePct > limit + LIMIT_EPSILON) {
    const shown = Math.round(effectivePct * 100) / 100;
    throw new ForbiddenException(`Descuento ${shown}% supera el límite del rol ${role}: ${limit}%`);
  }
}

/**
 * Desglosa el IVA de un ticket agrupando las líneas por tipo. Convención retail
 * España: los importes de línea (lineTotal) llevan el IVA incluido. Para cada
 * grupo, sobre el neto (Σ lineTotal del grupo): base = round2(neto/(1+t/100)),
 * cuota = round2(neto − base). El resultado va ordenado ascendente por taxRate.
 */
export function buildTaxBreakdown(
  lines: { taxRate: number; lineTotal: number }[],
): { taxRate: number; base: number; cuota: number }[] {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + l.lineTotal);
  }
  return [...byRate.entries()]
    .map(([taxRate, neto]) => {
      const base = round2(neto / (1 + taxRate / 100));
      const cuota = round2(neto - base);
      return { taxRate, base, cuota };
    })
    .sort((a, b) => a.taxRate - b.taxRate);
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

  async create(dto: CreateSaleDto, userId: string, role: SaleRole) {
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
        discountPct: l.discountPct ?? 0,
        taxRate: Number(product.taxRate),
      };
    });

    const ticket: TicketDiscount = {
      ...(dto.ticketDiscountPct !== undefined ? { ticketDiscountPct: dto.ticketDiscountPct } : {}),
      ...(dto.ticketDiscountAmt !== undefined ? { ticketDiscountAmt: dto.ticketDiscountAmt } : {}),
    };
    const { lines, subtotal, discountTotal, total } = computeTotals(priced, ticket);

    // Límite por rol sobre el % efectivo total (sobre el bruto, sin descuentos).
    const grossTotal = round2(priced.reduce((acc, l) => acc + l.unitPrice * l.qty, 0));
    assertDiscountWithinRoleLimit(role, discountTotal, grossTotal);

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
          discountTotal,
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
              discountPct: l.discountPct ?? 0,
              discountAmt: l.discountAmt,
              taxRate: l.taxRate ?? 21,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Carga una venta del tenant y devuelve el ticket-resumen para impresión.
   * RLS aísla por tenant: una venta de otra organización no es visible aquí
   * (findFirst → null) → NotFoundException (404). El desglose de IVA se calcula
   * al vuelo desde el taxRate congelado de cada línea.
   */
  async getTicket(id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id },
      include: { lines: true, store: true, organization: true },
    });
    if (!sale) {
      throw new NotFoundException(`Venta ${id} no encontrada`);
    }

    const taxBreakdown = buildTaxBreakdown(
      sale.lines.map((l) => ({ taxRate: Number(l.taxRate), lineTotal: Number(l.lineTotal) })),
    );

    return {
      organization: { name: sale.organization.name, nif: sale.organization.nif },
      store: { name: sale.store.name, code: sale.store.code },
      ticketNumber: sale.ticketNumber,
      createdAt: sale.createdAt,
      lines: sale.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        lineTotal: l.lineTotal,
      })),
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      cashGiven: sale.cashGiven,
      cashChange: sale.cashChange,
      taxBreakdown,
    };
  }
}
