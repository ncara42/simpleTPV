// Forma de los datos que las tools envían en `structuredContent` y que la UI
// pinta. Campos opcionales: el backend puede devolver subconjuntos o, en las
// compuestas resilientes, un `{ error }` en una rama concreta.

export interface SalesDay {
  today?: { total?: number; count?: number };
  yesterday?: { total?: number; count?: number };
  deltaPct?: number | null;
}

export interface SalesKpis {
  salesCount?: number;
  revenue?: number;
  avgTicket?: number;
  discountRate?: number;
  returnRate?: number;
}

export interface StockoutKpis {
  events?: number;
  open?: number;
  resolved?: number;
  estimatedLostSales?: number;
  rate?: number;
}

export interface StockAlert {
  id?: string;
  productName?: string;
  storeName?: string;
  alertType?: string;
  severity?: string;
}

export interface OverviewData {
  kind: 'overview';
  salesDay?: SalesDay;
  kpis?: SalesKpis;
  stockoutKpis?: StockoutKpis;
  alerts?: StockAlert[];
}

export interface MarginKpis {
  grossMargin?: number;
  marginPct?: number;
  revenue?: number;
}

// Items de los desgloses (campos camelCase del backend).
export interface SalesByFamilyItem {
  familyName?: string;
  total?: number;
}
export interface SalesByEmployeeItem {
  userName?: string;
  total?: number;
  salesCount?: number;
}
export interface SalesByHourItem {
  hour?: number;
  revenue?: number;
  count?: number;
}
export interface SalesByStoreItem {
  storeName?: string;
  revenue?: number;
}

/**
 * Cada rama del breakdown puede llegar como su array de datos o como `{ error }`
 * (las compuestas son resilientes vía `safe()`), de ahí `unknown` + narrowing en la vista.
 */
export interface BreakdownData {
  kind: 'breakdown';
  kpis?: unknown;
  margin?: unknown;
  byStore?: unknown;
  byFamily?: unknown;
  byHour?: unknown;
  byEmployee?: unknown;
}

/** Discriminada por `kind`. */
export type DashboardData = OverviewData | BreakdownData;
