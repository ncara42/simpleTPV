import { api } from './auth.js';

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
  return api.get<ZReport>('/z-report', { storeId, date });
}
