import type { PurchaseOrderStatus, Supplier } from '@simpletpv/auth';

// Modelo de vista de Proveedores: tipos de facetas + agregación de métricas por
// proveedor (a partir de sus pedidos de compra) + filtrado y agrupación. Lógica pura
// y testeable (espejo de catalog/facets.ts): la sección solo orquesta datos y estado.

export type SavedView = 'all' | 'open' | 'noOrders' | 'inactive';
export type StatusKey = 'active' | 'inactive';
export type LeadKey = 'fast' | 'mid' | 'slow';

export interface SupplierFilters {
  view: SavedView;
  status: ReadonlySet<StatusKey>;
  lead: ReadonlySet<LeadKey>;
}

export interface SupplierFacetCounts {
  views: Record<SavedView, number>;
  status: Record<StatusKey, number>;
  lead: Record<LeadKey, number>;
}

// Vista mínima de un pedido de compra: solo los campos que esta tabla agrega. El
// `listPurchaseOrders` real devuelve más, pero limitamos la superficie a lo usado.
export interface SupplierOrderLite {
  supplierId?: string | null;
  status: PurchaseOrderStatus;
  createdAt: string;
  lines: ReadonlyArray<{ quantityReceived?: number | null }>;
  kpis?: { fillRate?: number | null } | null;
}

export interface SupplierMetrics {
  totalOrders: number;
  /** Pedidos no recibidos del todo (borrador / confirmado / parcial). */
  openCount: number;
  /** Pedidos creados en los últimos 365 días. */
  orders12m: number;
  receivedCount: number;
  /** Media de fill rate (%) sobre los pedidos que lo reportan; null si ninguno. */
  onTimePct: number | null;
  /** Timestamp de la última recepción (pedido RECIBIDO más reciente); null si no hay. */
  lastReceipt: number | null;
}

export interface SupplierRow {
  supplier: Supplier;
  metrics: SupplierMetrics;
}

export interface SupplierGroup {
  key: StatusKey;
  label: string;
  count: number;
  openTotal: number;
  rows: SupplierRow[];
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const EMPTY_METRICS: SupplierMetrics = {
  totalOrders: 0,
  openCount: 0,
  orders12m: 0,
  receivedCount: 0,
  onTimePct: null,
  lastReceipt: null,
};

export function leadKeyOf(days: number): LeadKey {
  if (days <= 3) return 'fast';
  if (days <= 7) return 'mid';
  return 'slow';
}

export function statusKeyOf(supplier: Supplier): StatusKey {
  return supplier.active ? 'active' : 'inactive';
}

export function metricsOf(map: ReadonlyMap<string, SupplierMetrics>, id: string): SupplierMetrics {
  return map.get(id) ?? EMPTY_METRICS;
}

// Agrega los pedidos por proveedor en métricas. `nowMs` se inyecta para mantener la
// función pura (sin Date.now interno) y poder fijar la ventana de 12 meses en tests.
export function buildMetrics(
  suppliers: readonly Supplier[],
  orders: readonly SupplierOrderLite[],
  nowMs: number,
): Map<string, SupplierMetrics> {
  const acc = new Map<
    string,
    { total: number; open: number; o12: number; recv: number; fills: number[]; last: number | null }
  >();
  const seed = (id: string) => {
    let e = acc.get(id);
    if (!e) {
      e = { total: 0, open: 0, o12: 0, recv: 0, fills: [], last: null };
      acc.set(id, e);
    }
    return e;
  };

  for (const order of orders) {
    const id = order.supplierId;
    if (!id) continue;
    const e = seed(id);
    e.total += 1;
    const received = order.status === 'RECEIVED';
    if (received) e.recv += 1;
    else e.open += 1;
    const created = Date.parse(order.createdAt);
    if (!Number.isNaN(created)) {
      if (nowMs - created <= YEAR_MS) e.o12 += 1;
      if (received && (e.last === null || created > e.last)) e.last = created;
    }
    const fill = order.kpis?.fillRate;
    if (fill != null) e.fills.push(fill);
  }

  const out = new Map<string, SupplierMetrics>();
  for (const s of suppliers) {
    const e = acc.get(s.id);
    if (!e) {
      out.set(s.id, EMPTY_METRICS);
      continue;
    }
    const onTimePct =
      e.fills.length > 0
        ? Math.round((e.fills.reduce((a, b) => a + b, 0) / e.fills.length) * 100)
        : null;
    out.set(s.id, {
      totalOrders: e.total,
      openCount: e.open,
      orders12m: e.o12,
      receivedCount: e.recv,
      onTimePct,
      lastReceipt: e.last,
    });
  }
  return out;
}

function matchesView(supplier: Supplier, metrics: SupplierMetrics, view: SavedView): boolean {
  switch (view) {
    case 'open':
      return metrics.openCount > 0;
    case 'noOrders':
      return metrics.totalOrders === 0;
    case 'inactive':
      return !supplier.active;
    default:
      return true;
  }
}

export function filterSuppliers(
  suppliers: readonly Supplier[],
  metricsBy: ReadonlyMap<string, SupplierMetrics>,
  filters: SupplierFilters,
  term: string,
): Supplier[] {
  const q = term.trim().toLowerCase();
  return suppliers.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false;
    const m = metricsOf(metricsBy, s.id);
    if (!matchesView(s, m, filters.view)) return false;
    if (filters.status.size > 0 && !filters.status.has(statusKeyOf(s))) return false;
    if (filters.lead.size > 0 && !filters.lead.has(leadKeyOf(s.leadTimeDays))) return false;
    return true;
  });
}

// Recuentos para el carril: sobre el conjunto filtrado SOLO por búsqueda (las
// selecciones de facetas no se auto-excluyen para mostrar cuántos hay de cada una).
export function computeFacetCounts(
  suppliers: readonly Supplier[],
  metricsBy: ReadonlyMap<string, SupplierMetrics>,
  term: string,
): SupplierFacetCounts {
  const q = term.trim().toLowerCase();
  const base = q ? suppliers.filter((s) => s.name.toLowerCase().includes(q)) : suppliers;
  const counts: SupplierFacetCounts = {
    views: { all: 0, open: 0, noOrders: 0, inactive: 0 },
    status: { active: 0, inactive: 0 },
    lead: { fast: 0, mid: 0, slow: 0 },
  };
  for (const s of base) {
    const m = metricsOf(metricsBy, s.id);
    counts.views.all += 1;
    if (m.openCount > 0) counts.views.open += 1;
    if (m.totalOrders === 0) counts.views.noOrders += 1;
    if (!s.active) counts.views.inactive += 1;
    counts.status[statusKeyOf(s)] += 1;
    counts.lead[leadKeyOf(s.leadTimeDays)] += 1;
  }
  return counts;
}

const GROUP_LABELS: Record<StatusKey, string> = { active: 'Activos', inactive: 'Inactivos' };
const GROUP_ORDER: readonly StatusKey[] = ['active', 'inactive'];

export function buildGroups(
  suppliers: readonly Supplier[],
  metricsBy: ReadonlyMap<string, SupplierMetrics>,
): SupplierGroup[] {
  const byKey = new Map<StatusKey, SupplierRow[]>();
  for (const s of suppliers) {
    const key = statusKeyOf(s);
    const rows = byKey.get(key) ?? [];
    rows.push({ supplier: s, metrics: metricsOf(metricsBy, s.id) });
    byKey.set(key, rows);
  }
  const groups: SupplierGroup[] = [];
  for (const key of GROUP_ORDER) {
    const rows = byKey.get(key);
    if (!rows || rows.length === 0) continue;
    rows.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
    groups.push({
      key,
      label: GROUP_LABELS[key],
      count: rows.length,
      openTotal: rows.reduce((sum, r) => sum + r.metrics.openCount, 0),
      rows,
    });
  }
  return groups;
}
