import { api } from './auth.js';

export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year';

// Modo de comparación del panel de ventas por tienda: día (hoy vs ayer), mes
// (este mes vs el anterior) o año (este año vs el anterior). Siempre "a la misma
// altura". En `today`/`yesterday` del response, hoy=actual y ayer=anterior.
export type SalesCompareMode = 'day' | 'month' | 'year';

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
  series?: number[];
  intraday?: number[];
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
  series?: {
    avgTicket: number[];
    upt: number[];
    discountRate: number[];
    returnRate: number[];
  };
}

export interface MarginKpis {
  grossMargin: number;
  realMargin: number;
  marginPct: number;
  revenue: number;
  series?: number[];
  realMarginSeries?: number[];
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

export interface SalesByHour {
  hour: number;
  count: number;
  revenue: number;
}

export interface DiscountByEmployee {
  userId: string;
  userName: string;
  salesCount: number;
  avgDiscountPct: number;
}

// Ventas por vendedor (D-08, preset Equipo): facturación y tickets por empleado.
export interface SalesByEmployee {
  userId: string;
  userName: string;
  salesCount: number;
  total: number;
}

export interface ProductRotation {
  productId: string;
  name: string;
  units: number;
  daysSinceLastSale: number | null;
  trend: number[];
  isNew: boolean;
  archetypeAvgDaily: number | null;
}

export interface ArchetypeRotation {
  familyId: string | null;
  familyName: string;
  productCount: number;
  units: number;
  ventaMediaDiaria: number;
  daysSinceLastSale: number | null;
  trend: number[];
}

const periodQuery = (period: DashboardPeriod, storeId?: string): Record<string, string> => ({
  period,
  ...(storeId ? { storeId } : {}),
});

export function getSalesToday(
  storeId?: string,
  compare: SalesCompareMode = 'day',
): Promise<SalesTodayResponse> {
  return api.get<SalesTodayResponse>('/dashboard/sales-today', {
    ...(storeId ? { storeId } : {}),
    // `day` es el valor por defecto del backend: no lo enviamos para mantener la
    // URL de la KPI card "Facturación hoy" idéntica a antes (cache-friendly).
    ...(compare !== 'day' ? { compare } : {}),
  });
}

export function getSalesByFamily(
  period: DashboardPeriod,
  storeId?: string,
): Promise<FamilySales[]> {
  return api.get<FamilySales[]>('/dashboard/sales-by-family', periodQuery(period, storeId));
}

export function getSalesByHour(period: DashboardPeriod, storeId?: string): Promise<SalesByHour[]> {
  return api.get<SalesByHour[]>('/dashboard/sales-by-hour', periodQuery(period, storeId));
}

// Ventas por hora de UN día concreto (no agregado del rango): usa el periodo `custom`
// con from=to=día, que el backend resuelve a [día 00:00, día+1 00:00). `dayIso` es
// 'YYYY-MM-DD' en hora local. Así la card refleja siempre horas reales de ese día.
export function getSalesByHourOnDay(dayIso: string, storeId?: string): Promise<SalesByHour[]> {
  return api.get<SalesByHour[]>('/dashboard/sales-by-hour', {
    period: 'custom',
    from: dayIso,
    to: dayIso,
    ...(storeId ? { storeId } : {}),
  });
}

export function getDiscountByEmployee(
  period: DashboardPeriod,
  storeId?: string,
): Promise<DiscountByEmployee[]> {
  return api.get<DiscountByEmployee[]>(
    '/dashboard/discount-by-employee',
    periodQuery(period, storeId),
  );
}

export function getSalesByEmployee(
  period: DashboardPeriod,
  storeId?: string,
): Promise<SalesByEmployee[]> {
  return api.get<SalesByEmployee[]>('/dashboard/sales-by-employee', periodQuery(period, storeId));
}

export function getProductRotation(
  period: DashboardPeriod,
  storeId?: string,
): Promise<ProductRotation[]> {
  return api.get<ProductRotation[]>('/dashboard/product-rotation', periodQuery(period, storeId));
}

export function getArchetypeRotation(
  period: DashboardPeriod,
  storeId?: string,
): Promise<ArchetypeRotation[]> {
  return api.get<ArchetypeRotation[]>(
    '/dashboard/archetype-rotation',
    periodQuery(period, storeId),
  );
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
