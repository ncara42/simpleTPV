import { api } from './auth.js';

// Tipos espejo de las respuestas de la API de dashboards (#70). Se definen aquí
// (no en @simpletpv/auth) porque solo los consume el backoffice.
export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month';

export interface SalesTodayResponse {
  today: { total: number; count: number };
  yesterday: { total: number; count: number };
  deltaPct: number | null;
  byStore: Array<{
    storeId: string;
    storeName: string;
    today: number;
    yesterday: number;
    deltaPct: number | null;
  }>;
}

export interface FamilySales {
  familyId: string | null;
  familyName: string;
  color: string | null;
  total: number;
}

export interface SalesKpis {
  salesCount: number;
  revenue: number;
  avgTicket: number;
  upt: number;
  discountRate: number;
  returnRate: number;
}

export interface MarginKpis {
  grossMargin: number;
  realMargin: number;
  marginPct: number;
  revenue: number;
}

export interface StockoutKpis {
  events: number;
  resolved: number;
  open: number;
  avgDurationHours: number | null;
  rate: number;
  estimatedLostSales: number;
}

export interface ProductRankings {
  topSales: Array<{ productId: string; name: string; total: number; units: number }>;
  topMargin: Array<{ productId: string; name: string; margin: number }>;
  worstRotation: Array<{ productId: string; name: string; units: number }>;
}

// Query común: periodo + tienda opcional. La API acepta también from/to (custom),
// no expuestos en la UI del MVP.
function periodQuery(
  period: DashboardPeriod,
  storeId?: string,
): Record<string, string | undefined> {
  return { period, storeId: storeId || undefined };
}

export function getSalesToday(storeId?: string): Promise<SalesTodayResponse> {
  return api.get<SalesTodayResponse>('/dashboard/sales-today', { storeId: storeId || undefined });
}

export function getSalesByFamily(
  period: DashboardPeriod,
  storeId?: string,
): Promise<FamilySales[]> {
  return api.get<FamilySales[]>('/dashboard/sales-by-family', periodQuery(period, storeId));
}

export function getSalesKpis(period: DashboardPeriod, storeId?: string): Promise<SalesKpis> {
  return api.get<SalesKpis>('/dashboard/sales-kpis', periodQuery(period, storeId));
}

export function getMarginKpis(period: DashboardPeriod, storeId?: string): Promise<MarginKpis> {
  return api.get<MarginKpis>('/dashboard/margin-kpis', periodQuery(period, storeId));
}

export function getStockoutKpis(period: DashboardPeriod, storeId?: string): Promise<StockoutKpis> {
  return api.get<StockoutKpis>('/dashboard/stockout-kpis', periodQuery(period, storeId));
}

export function getProductRankings(
  period: DashboardPeriod,
  storeId?: string,
): Promise<ProductRankings> {
  return api.get<ProductRankings>('/dashboard/product-rankings', periodQuery(period, storeId));
}
