/**
 * Dominio puro del CIERRE Z (arqueo fiscal diario por tienda, #124): toma las
 * ventas de un día de una tienda y construye el informe fiscal (totales, desglose
 * por tipo de IVA y por método de pago, nº de tickets y rango de numeración). Sin
 * efectos (no toca BD ni tenant) para poder probarlo de forma aislada.
 *
 * Reutiliza `buildTaxBreakdown` (mismo desglose de IVA que el ticket): por cada
 * venta COMPLETED se calcula su desglose prorrateando SU descuento de ticket
 * (subtotal − total) y se acumula por tipo, de modo que Σ(base+cuota) del informe
 * cuadra con el total del día.
 */
import { round2 } from '../common/money.js';
import { buildTaxBreakdown } from '../sales/sales.domain.js';

export interface ZReportSaleLine {
  taxRate: number;
  lineTotal: number;
}

export interface ZReportSale {
  ticketNumber: string;
  // COMPLETED entra en los totales; VOIDED solo cuenta como anulada (informativo)
  // pero su nº SÍ forma parte del rango de numeración emitido del día.
  status: string;
  paymentMethod: string;
  subtotal: number;
  total: number;
  discountTotal: number;
  lines: ZReportSaleLine[];
}

export interface ZReportTaxRow {
  taxRate: number;
  base: number;
  cuota: number;
}

export interface ZReportPaymentRow {
  paymentMethod: string;
  count: number;
  total: number;
}

export interface ZReportStore {
  id: string;
  name: string;
  code: string;
}

export interface ZReport {
  store: ZReportStore;
  date: string; // YYYY-MM-DD
  // Nº de tickets que entran en los totales (COMPLETED).
  ticketCount: number;
  // Nº de ventas anuladas del día (VOIDED): no suman, se listan para auditoría.
  voidedCount: number;
  // Rango de numeración EMITIDO el día (COMPLETED + VOIDED). Puede haber HUECOS
  // justificados: la numeración offline por bloques reserva nº que pueden quedar
  // sin usar (ver épico offline). Por eso (lastNº − firstNº + 1) ≥ ticketCount.
  firstTicketNumber: string | null;
  lastTicketNumber: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  taxBreakdown: ZReportTaxRow[];
  paymentBreakdown: ZReportPaymentRow[];
}

/**
 * Construye el cierre Z a partir de las ventas del día de una tienda (COMPLETED y
 * VOIDED). Los totales y desgloses SOLO cuentan COMPLETED; las VOIDED aportan su
 * número al rango emitido y al contador de anuladas.
 */
export function buildZReport(store: ZReportStore, date: string, sales: ZReportSale[]): ZReport {
  const completed = sales.filter((s) => s.status === 'COMPLETED');
  const voided = sales.filter((s) => s.status === 'VOIDED');

  // Rango de numeración emitido: min/max sobre TODOS los nº del día (completadas +
  // anuladas). Comparten prefijo "T<code>-" con padding a 6, así que el orden
  // lexicográfico coincide con el numérico. Vacío → null.
  const issuedNumbers = [...completed, ...voided].map((s) => s.ticketNumber).sort();
  const firstTicketNumber = issuedNumbers[0] ?? null;
  const lastTicketNumber = issuedNumbers[issuedNumbers.length - 1] ?? null;

  const subtotal = round2(completed.reduce((acc, s) => acc + s.subtotal, 0));
  const discountTotal = round2(completed.reduce((acc, s) => acc + s.discountTotal, 0));
  const total = round2(completed.reduce((acc, s) => acc + s.total, 0));

  return {
    store,
    date,
    ticketCount: completed.length,
    voidedCount: voided.length,
    firstTicketNumber,
    lastTicketNumber,
    subtotal,
    discountTotal,
    total,
    taxBreakdown: aggregateTaxBreakdown(completed),
    paymentBreakdown: aggregatePayments(completed),
  };
}

// Suma el desglose de IVA de todas las ventas. Por cada venta se calcula su
// desglose con SU descuento de ticket (subtotal − total) prorrateado, y se acumula
// base/cuota por tipo. Redondeo final a céntimos. Orden ascendente por tipo.
function aggregateTaxBreakdown(sales: ZReportSale[]): ZReportTaxRow[] {
  const byRate = new Map<number, { base: number; cuota: number }>();
  for (const sale of sales) {
    const ticketDiscount = round2(sale.subtotal - sale.total);
    const breakdown = buildTaxBreakdown(sale.lines, ticketDiscount);
    for (const row of breakdown) {
      const acc = byRate.get(row.taxRate) ?? { base: 0, cuota: 0 };
      acc.base += row.base;
      acc.cuota += row.cuota;
      byRate.set(row.taxRate, acc);
    }
  }
  return [...byRate.entries()]
    .map(([taxRate, v]) => ({ taxRate, base: round2(v.base), cuota: round2(v.cuota) }))
    .sort((a, b) => a.taxRate - b.taxRate);
}

// Desglose por método de pago: nº de tickets y total por método. Orden estable
// por nombre de método para una salida determinista.
function aggregatePayments(sales: ZReportSale[]): ZReportPaymentRow[] {
  const byMethod = new Map<string, { count: number; total: number }>();
  for (const sale of sales) {
    const acc = byMethod.get(sale.paymentMethod) ?? { count: 0, total: 0 };
    acc.count += 1;
    acc.total += sale.total;
    byMethod.set(sale.paymentMethod, acc);
  }
  return [...byMethod.entries()]
    .map(([paymentMethod, v]) => ({ paymentMethod, count: v.count, total: round2(v.total) }))
    .sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));
}
