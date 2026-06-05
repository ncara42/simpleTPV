/**
 * Dominio puro de ventas: tipos, constantes y funciones SIN efectos (no tocan
 * la base de datos ni el contexto de tenant). Aquí vive toda la aritmética de
 * importes, descuentos e IVA del ticket, separada de la orquestación de
 * `SalesService` para poder probarla de forma aislada y reutilizarla.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PaymentMethod } from '@simpletpv/db';

import { round2 } from '../common/money.js';

export type SaleRole = 'ADMIN' | 'MANAGER' | 'CLERK';

export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  // % de descuento de la línea (0–100). Ausente o 0 = sin descuento.
  discountPct?: number;
  // Importe fijo de descuento de la línea (>= 0). Ausente = sin importe fijo.
  // Tiene precedencia sobre discountPct y se capa al bruto (ver computeTotals).
  discountAmt?: number;
  // IVA del producto congelado en el momento de la venta.
  taxRate?: number;
  // Coste unitario del producto congelado en el momento de la venta (IT-03).
  costPrice?: number;
}

export interface TicketDiscount {
  ticketDiscountPct?: number;
  ticketDiscountAmt?: number;
}

export interface ComputedLine extends PricedLine {
  // Importe bruto de la línea (unitPrice*qty) antes del descuento de línea.
  gross: number;
  // Importe EFECTIVO del descuento de la línea, ya resuelto: si vino importe
  // fijo (discountAmt) se usa ese capado al bruto; si no, round2(gross*pct/100).
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

/**
 * Convierte un día (YYYY-MM-DD) en el rango UTC semiabierto [gte, lt) que cubre
 * exactamente ese día: gte = 00:00:00.000Z del día, lt = 00:00:00.000Z del día
 * siguiente. Usar este rango en `createdAt: { gte, lt }` evita problemas de
 * comparación con horas y deja el límite superior abierto. Función pura, testeable.
 *
 * DEUDA CONOCIDA (MVP): el día se interpreta en UTC, no en la zona local del
 * usuario (España +1/+2). Las ventas de la madrugada local pueden caer en el día
 * UTC contiguo. Aceptable para el MVP; al internacionalizar, recibir el offset o
 * normalizar a Europe/Madrid en el servidor.
 */
export function dayRange(date: string): { gte: Date; lt: Date } {
  const gte = new Date(`${date}T00:00:00.000Z`);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
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
  //    El importe fijo (discountAmt) tiene precedencia sobre el % y se capa al
  //    bruto, igual que el descuento de ticket → el neto nunca es negativo.
  const priced: ComputedLine[] = lines.map((l) => {
    const gross = round2(l.unitPrice * l.qty);
    const discountAmt =
      l.discountAmt !== undefined && l.discountAmt > 0
        ? round2(Math.min(l.discountAmt, gross))
        : round2((gross * (l.discountPct ?? 0)) / 100);
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
 * España: los importes de línea (lineTotal) llevan el IVA incluido.
 *
 * El descuento de TICKET (ticketDiscount = subtotal − total) se prorratea entre
 * los grupos de IVA proporcionalmente al neto de cada grupo ANTES de calcular
 * base/cuota. Sin esto, Σ(base+cuota) sumaría el subtotal (neto sin descuento de
 * ticket) y no el total impreso → descuadre fiscal cuando hay descuento de ticket.
 *
 * Para cada grupo, sobre el neto ajustado (neto del grupo − su prorrateo):
 * base = round2(netoAjustado/(1+t/100)), cuota = round2(netoAjustado − base).
 *
 * El prorrateo de los grupos se redondea a céntimos; para que Σ prorrateos sea
 * EXACTAMENTE el descuento de ticket (sin descuadre de 1 céntimo), el grupo de
 * mayor neto absorbe la diferencia residual. Resultado ordenado ascendente por
 * taxRate.
 */
export function buildTaxBreakdown(
  lines: { taxRate: number; lineTotal: number }[],
  ticketDiscount = 0,
): { taxRate: number; base: number; cuota: number }[] {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + l.lineTotal);
  }

  const subtotal = round2([...byRate.values()].reduce((acc, n) => acc + n, 0));
  if (subtotal <= 0) {
    return [];
  }

  // Grupos ordenados por taxRate ascendente para una salida estable.
  const groups = [...byRate.entries()]
    .map(([taxRate, neto]) => ({ taxRate, neto }))
    .sort((a, b) => a.taxRate - b.taxRate);

  // Prorrateo del descuento de ticket por grupo. Para evitar descuadres de
  // céntimo, el grupo de MAYOR neto absorbe el residuo: calculamos el prorrateo
  // redondeado de todos los demás y el grupo gordo se lleva lo que falte.
  const discount = round2(ticketDiscount);
  let absorberIdx = 0;
  for (let i = 1; i < groups.length; i++) {
    if (groups[i]!.neto > groups[absorberIdx]!.neto) {
      absorberIdx = i;
    }
  }

  let assigned = 0;
  const prorate = groups.map((g, i) => {
    if (i === absorberIdx) {
      return 0; // se calcula al final con el residuo
    }
    const p = round2((discount * g.neto) / subtotal);
    assigned = round2(assigned + p);
    return p;
  });
  prorate[absorberIdx] = round2(discount - assigned);

  return groups.map((g, i) => {
    const netoAjustado = round2(g.neto - prorate[i]!);
    const base = round2(netoAjustado / (1 + g.taxRate / 100));
    const cuota = round2(netoAjustado - base);
    return { taxRate: g.taxRate, base, cuota };
  });
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
