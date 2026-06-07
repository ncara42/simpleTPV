import { DEMO_STORES } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

// Cierre Z (arqueo fiscal diario por tienda, #124). Espejo del contrato de
// GET /z-report del API. Los importes llegan como number (Decimal normalizado en
// el servidor).
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

export interface ZReport {
  store: { id: string; name: string; code: string };
  date: string;
  ticketCount: number;
  voidedCount: number;
  firstTicketNumber: string | null;
  lastTicketNumber: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  taxBreakdown: ZReportTaxRow[];
  paymentBreakdown: ZReportPaymentRow[];
}

export function getZReport(storeId: string, date: string): Promise<ZReport> {
  if (isDemo()) {
    return Promise.resolve(demoZReport(storeId, date));
  }
  return api.get<ZReport>('/z-report', { storeId, date });
}

// Cierre Z de ejemplo para el modo demo (sin backend): cuadra Σ(base+cuota) y
// Σ(pagos) con el total, igual que el informe real.
function demoZReport(storeId: string, date: string): ZReport {
  const store = DEMO_STORES.find((s) => s.id === storeId) ?? DEMO_STORES[0]!;
  return {
    store: { id: store.id, name: store.name, code: store.code },
    date,
    ticketCount: 42,
    voidedCount: 2,
    firstTicketNumber: `T${store.code}-000101`,
    lastTicketNumber: `T${store.code}-000144`,
    subtotal: 1893.5,
    discountTotal: 64.2,
    total: 1829.3,
    taxBreakdown: [
      { taxRate: 10, base: 480.0, cuota: 48.0 },
      { taxRate: 21, base: 1241.57, cuota: 261.73 },
    ],
    paymentBreakdown: [
      { paymentMethod: 'CARD', count: 27, total: 1187.4 },
      { paymentMethod: 'CASH', count: 15, total: 641.9 },
    ],
  };
}
