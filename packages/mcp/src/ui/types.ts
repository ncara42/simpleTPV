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

/** Discriminada por `kind`; el breakdown se añadirá en el siguiente incremento. */
export type DashboardData = OverviewData;
