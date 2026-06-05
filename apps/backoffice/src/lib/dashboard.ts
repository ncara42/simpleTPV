import {
  DEMO_DISCOUNT_BY_EMPLOYEE,
  DEMO_MARGIN_KPIS,
  DEMO_RANKINGS,
  DEMO_SALES_BY_FAMILY,
  DEMO_SALES_BY_HOUR,
  DEMO_SALES_KPIS,
  DEMO_SALES_TODAY,
  DEMO_STOCKOUT_KPIS,
} from '../demo/demoData.js';
import { isDemo } from './api-config.js';
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
  // Serie diaria de facturación para la sparkline de la card. Opcional: hoy solo
  // la rellena el modo demo; cuando se cablee la API real habrá que añadir el
  // GROUP BY DATE_TRUNC en dashboard.service.ts.
  series?: number[];
  // Acumulado de facturación de HOY por hora (STAT-01): la sparkline intradía de
  // la card "Facturación hoy". El backend ya lo devuelve (salesToday.intraday).
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
  // Series diarias por métrica para las sparklines (ver nota en SalesTodayResponse).
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
  // Serie diaria de marginPct para la sparkline de "% Margen".
  series?: number[];
  // Serie diaria de beneficio (€, realMargin) para la sparkline de "Beneficio" (STAT-03).
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

// Ventas por hora del día (STAT-02): tickets e importe por hora con ventas.
export interface SalesByHour {
  hour: number;
  count: number;
  revenue: number;
}

// Descuento medio por vendedor (STAT-04): tasa de descuento de ticket por usuario.
export interface DiscountByEmployee {
  userId: string;
  userName: string;
  salesCount: number;
  avgDiscountPct: number;
}

// Dashboard (IT-09): en demo devuelve los datos calcados al mockup; en real va
// contra /dashboard/*. NOTA: el backend devuelve los KPIs y el intradía (STAT-01),
// pero AÚN NO las series diarias de las sparklines de las cards (series/
// realMarginSeries) — al ser opcionales, en real esas mini-gráficas no se pintan.
const periodQuery = (period: DashboardPeriod, storeId?: string): Record<string, string> => ({
  period,
  ...(storeId ? { storeId } : {}),
});

export function getSalesToday(storeId?: string): Promise<SalesTodayResponse> {
  if (isDemo()) return Promise.resolve(DEMO_SALES_TODAY);
  return api.get<SalesTodayResponse>('/dashboard/sales-today', {
    ...(storeId ? { storeId } : {}),
  });
}

export function getSalesByFamily(
  period: DashboardPeriod,
  storeId?: string,
): Promise<FamilySales[]> {
  if (isDemo()) return Promise.resolve(DEMO_SALES_BY_FAMILY);
  return api.get<FamilySales[]>('/dashboard/sales-by-family', periodQuery(period, storeId));
}

export function getSalesByHour(period: DashboardPeriod, storeId?: string): Promise<SalesByHour[]> {
  if (isDemo()) return Promise.resolve(DEMO_SALES_BY_HOUR);
  return api.get<SalesByHour[]>('/dashboard/sales-by-hour', periodQuery(period, storeId));
}

export function getDiscountByEmployee(
  period: DashboardPeriod,
  storeId?: string,
): Promise<DiscountByEmployee[]> {
  if (isDemo()) return Promise.resolve(DEMO_DISCOUNT_BY_EMPLOYEE);
  return api.get<DiscountByEmployee[]>(
    '/dashboard/discount-by-employee',
    periodQuery(period, storeId),
  );
}

export function getSalesKpis(period: DashboardPeriod, storeId?: string): Promise<SalesKpis> {
  if (isDemo()) return Promise.resolve(DEMO_SALES_KPIS);
  return api.get<SalesKpis>('/dashboard/sales-kpis', periodQuery(period, storeId));
}

export function getMarginKpis(period: DashboardPeriod, storeId?: string): Promise<MarginKpis> {
  if (isDemo()) return Promise.resolve(DEMO_MARGIN_KPIS);
  return api.get<MarginKpis>('/dashboard/margin-kpis', periodQuery(period, storeId));
}

export function getStockoutKpis(period: DashboardPeriod, storeId?: string): Promise<StockoutKpis> {
  if (isDemo()) return Promise.resolve(DEMO_STOCKOUT_KPIS);
  return api.get<StockoutKpis>('/dashboard/stockout-kpis', periodQuery(period, storeId));
}

export function getProductRankings(
  period: DashboardPeriod,
  storeId?: string,
): Promise<ProductRankings> {
  if (isDemo()) return Promise.resolve(DEMO_RANKINGS);
  return api.get<ProductRankings>('/dashboard/product-rankings', periodQuery(period, storeId));
}
