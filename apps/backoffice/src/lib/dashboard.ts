import type { SalesByStoreItem, SalesTodayResponse } from '@simpletpv/auth';

import { api } from './auth.js';

// Tipo compartido (fuente de verdad en @simpletpv/auth): lo re-exportamos para no
// romper los imports existentes (`./lib/dashboard`) de StoresPage/DashboardPage.
export type { SalesByStoreItem, SalesTodayResponse };

export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year';

// Modo de comparación del panel de ventas por tienda: día (hoy vs ayer), mes
// (este mes vs el anterior) o año (este año vs el anterior). Siempre "a la misma
// altura". En `today`/`yesterday` del response, hoy=actual y ayer=anterior.
export type SalesCompareMode = 'day' | 'month' | 'year';

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

// ── Sección 04 «Más exploraciones»: pago / tickets / objetivo / acumulado del mes ──

// Reparto de facturación por método de pago en el periodo (donut). `method` es el enum del
// backend (CASH/CARD/…); usa PAYMENT_METHOD_LABELS para la etiqueta legible.
export interface SalesByPayment {
  method: string;
  count: number;
  revenue: number;
}

// Etiqueta es-ES de cada método de pago del backend (paridad con el enum `PaymentMethod`).
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  BIZUM: 'Bizum',
  DIRECT_DEBIT: 'Domiciliación',
};

// Una venta reciente para el feed de actividad (`createdAt` ISO-8601 UTC).
export interface RecentSale {
  id: string;
  ticketNumber: string;
  storeName: string;
  total: number;
  paymentMethod: string;
  createdAt: string;
}

// Objetivo del periodo: facturación en curso, objetivo (= periodo anterior completo) y proyección.
export interface SalesGoal {
  current: number;
  target: number;
  projection: number;
}

// Acumulado diario del mes en curso (parcial) vs. el mes anterior completo, con proyección.
export interface CumulativeMonth {
  actual: number[];
  compare: number[];
  projectionEnd: number;
  totalPoints: number;
}

const periodQuery = (period: DashboardPeriod, storeId?: string): Record<string, string> => ({
  period,
  ...(storeId ? { storeId } : {}),
});

// Rango cerrado [from, to] (ISO 'YYYY-MM-DD') vía el periodo `custom` del backend. Lo usa el
// scrub histórico de la rejilla de KPIs para traer ventanas pasadas (mes/semana/día anterior…)
// reutilizando exactamente el mismo cálculo de serie que el periodo en vivo (mismo bucketing).
const rangeQuery = (from: string, to: string, storeId?: string): Record<string, string> => ({
  period: 'custom',
  from,
  to,
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

// Desglose de ventas por tienda (#224): facturación, nº tickets, ticket medio y margen
// por tienda, para cualquier periodo (a diferencia de getSalesToday, fijo a hoy/ayer).
// Lo usa la vista Tiendas (lista + hero de la ficha) al cambiar de periodo.
export function getSalesByStore(
  period: DashboardPeriod,
  storeId?: string,
): Promise<SalesByStoreItem[]> {
  return api.get<SalesByStoreItem[]>('/dashboard/sales-by-store', periodQuery(period, storeId));
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

// Variantes por rango cerrado (ventana histórica del scrub de KPIs). El backend bucketiza por
// hora (≤36 h → ventanas de día) o por día (rango mayor → ventanas de semana/mes/año).
export function getSalesKpisRange(from: string, to: string, storeId?: string): Promise<SalesKpis> {
  return api.get<SalesKpis>('/dashboard/sales-kpis', rangeQuery(from, to, storeId));
}

export function getMarginKpisRange(
  from: string,
  to: string,
  storeId?: string,
): Promise<MarginKpis> {
  return api.get<MarginKpis>('/dashboard/margin-kpis', rangeQuery(from, to, storeId));
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

// ── Sección 04 «Más exploraciones» ──

export function getSalesByPayment(
  period: DashboardPeriod,
  storeId?: string,
): Promise<SalesByPayment[]> {
  return api.get<SalesByPayment[]>('/dashboard/sales-by-payment', periodQuery(period, storeId));
}

// Últimas ventas (feed de actividad). `limit` se acota en el backend a [1, 50].
export function getRecentSales(limit = 8, storeId?: string): Promise<RecentSale[]> {
  return api.get<RecentSale[]>('/dashboard/recent-sales', {
    limit: String(limit),
    ...(storeId ? { storeId } : {}),
  });
}

export function getSalesGoal(period: DashboardPeriod, storeId?: string): Promise<SalesGoal> {
  return api.get<SalesGoal>('/dashboard/sales-goal', periodQuery(period, storeId));
}

// Acumulado del mes en curso vs. el anterior (siempre el mes natural; ignora el periodo activo).
export function getCumulativeMonth(storeId?: string): Promise<CumulativeMonth> {
  return api.get<CumulativeMonth>('/dashboard/cumulative-month', storeId ? { storeId } : {});
}
