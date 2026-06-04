import {
  DEMO_MARGIN_KPIS,
  DEMO_RANKINGS,
  DEMO_SALES_BY_FAMILY,
  DEMO_SALES_KPIS,
  DEMO_SALES_TODAY,
  DEMO_STOCKOUT_KPIS,
} from '../demo/demoData.js';

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
  // Serie diaria de marginPct para la sparkline (ver nota en SalesTodayResponse).
  series?: number[];
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

// Modo demo: las funciones devuelven datos hardcodeados calcados a los mockups.
export function getSalesToday(_storeId?: string): Promise<SalesTodayResponse> {
  return Promise.resolve(DEMO_SALES_TODAY);
}

export function getSalesByFamily(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<FamilySales[]> {
  return Promise.resolve(DEMO_SALES_BY_FAMILY);
}

export function getSalesKpis(_period: DashboardPeriod, _storeId?: string): Promise<SalesKpis> {
  return Promise.resolve(DEMO_SALES_KPIS);
}

export function getMarginKpis(_period: DashboardPeriod, _storeId?: string): Promise<MarginKpis> {
  return Promise.resolve(DEMO_MARGIN_KPIS);
}

export function getStockoutKpis(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<StockoutKpis> {
  return Promise.resolve(DEMO_STOCKOUT_KPIS);
}

export function getProductRankings(
  _period: DashboardPeriod,
  _storeId?: string,
): Promise<ProductRankings> {
  return Promise.resolve(DEMO_RANKINGS);
}
