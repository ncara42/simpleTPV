import type { Sale, SalesQueryInput, SalesStats, SaleTicket } from '@simpletpv/auth';

import { api } from './auth.js';

export type { SalesStats };

/**
 * Estadísticas embebidas de la page Ventas (S-10): GET /sales/stats con los MISMOS
 * filtros que `listSales` (tienda/vendedor/familia/estado + rango temporal), para que
 * el bloque de KPIs y la gráfica reflejen exactamente lo que muestra la tabla. La
 * paginación de la tabla no aplica aquí (el endpoint agrega todo el conjunto filtrado),
 * así que se omite. Devuelve serie temporal + KPIs del periodo + comparativa con el
 * periodo anterior (`previous` null si el filtro no acota un rango de fechas).
 */
export function getSalesStats(params: SalesQueryInput): Promise<SalesStats> {
  const { storeId, date, from, to, userId, familyId, status, q } = params;
  return api.get<SalesStats>('/sales/stats', {
    ...(storeId ? { storeId } : {}),
    ...(date ? { date } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(userId ? { userId } : {}),
    ...(familyId ? { familyId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
  });
}

/**
 * Detalle del ticket/factura de una venta (líneas + desglose de IVA) — GET
 * /sales/:id/ticket. Alimenta el bloque «Desglose» de la ficha del ledger.
 */
export function getTicket(saleId: string): Promise<SaleTicket> {
  return api.get<SaleTicket>(`/sales/${saleId}/ticket`);
}

/**
 * Registra el cobro de una factura a crédito (la marca PAID, sella `paidAt`) — POST
 * /sales/:id/collect. Idempotente: cobrar una venta ya pagada devuelve la venta tal
 * cual. Solo ADMIN/MANAGER. Devuelve la venta actualizada.
 */
export function collectSale(saleId: string): Promise<Sale> {
  return api.post<Sale>(`/sales/${saleId}/collect`);
}

/**
 * HTML imprimible del recibo/factura — GET /sales/:id/receipt. El endpoint exige
 * sesión (Bearer), así que NO se puede abrir con un `window.open` directo: se trae
 * el HTML con el cliente autenticado y el componente lo vuelca en una pestaña.
 */
export async function getReceiptHtml(saleId: string): Promise<string> {
  const res = await api.fetch(`/sales/${saleId}/receipt`);
  if (!res.ok) {
    throw new Error(`No se pudo cargar la factura (${res.status})`);
  }
  return res.text();
}
