import type { SalesQueryInput, SalesStats } from '@simpletpv/auth';

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
