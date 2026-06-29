// ════════════════════════════════════════════════════════════════════════════
// VENTAS — lógica pura del ledger de cobro (facetas, vistas, estado y filtrado).
// Espeja el modelo del prototipo Ventas.dc.html cableado a datos reales: el estado
// VENCIDA es derivado (PENDING + vencimiento pasado), no almacenado. Sin JSX: el
// componente consume estos datos y aplica las clases CSS / tokens --ui-*.
// ════════════════════════════════════════════════════════════════════════════

import type { SalesViewRow } from '../lib/admin.js';

/** Estado de cobro MOSTRADO (deriva de status + paymentStatus + vencimiento). */
export type CobroStatus = 'paid' | 'pending' | 'overdue' | 'void';

/** Vista guardada del carril (subconjunto por estado mostrado). */
export type SavedViewId = 'all' | 'pending' | 'overdue' | 'void';

/** Dimensiones facetables (multi-selección). */
export type FacetKey = 'cobro' | 'channel' | 'store' | 'seller' | 'method';

export const COBRO_LABELS: Record<CobroStatus, string> = {
  paid: 'Pagada',
  pending: 'Pendiente',
  overdue: 'Vencida',
  void: 'Anulada',
};

export const CHANNEL_LABELS: Record<string, string> = {
  TPV: 'TPV tienda',
  ONLINE: 'Online',
  B2B: 'Mayorista B2B',
};

/** Etiqueta corta del canal para la subcabecera de la fila (#ticket · hora · canal). */
export const CHANNEL_SHORT: Record<string, string> = {
  TPV: 'TPV',
  ONLINE: 'Online',
  B2B: 'B2B',
};

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  BIZUM: 'Bizum',
  DIRECT_DEBIT: 'Domiciliado',
};

export interface SalesFacetState {
  cobro: ReadonlySet<CobroStatus>;
  channel: ReadonlySet<string>;
  store: ReadonlySet<string>;
  seller: ReadonlySet<string>;
  method: ReadonlySet<string>;
}

export const EMPTY_SALES_FACETS: SalesFacetState = {
  cobro: new Set(),
  channel: new Set(),
  store: new Set(),
  seller: new Set(),
  method: new Set(),
};

/** Fecha de hoy (local) como `YYYY-MM-DD`, para comparar con el vencimiento. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Estado de cobro mostrado de una venta. Una venta anulada es `void`; si está
 * pagada, `paid`; si está pendiente y su vencimiento ya pasó, `overdue`; si no,
 * `pending`. La comparación de fechas `YYYY-MM-DD` es lexicográfica (válida en ISO).
 */
export function cobroStatusOf(row: SalesViewRow, today: string = todayIso()): CobroStatus {
  if (row.status === 'VOIDED') return 'void';
  if (row.paymentStatus === 'PAID') return 'paid';
  if (row.dueDate && row.dueDate < today) return 'overdue';
  return 'pending';
}

/** Nombre de cliente de la fila: el destinatario F1 o un genérico por canal. */
export function customerOf(row: SalesViewRow): string {
  const name = row.customerName?.trim();
  if (name) return name;
  if (row.channel === 'ONLINE') return 'Venta online';
  if (row.channel === 'B2B') return 'Cliente B2B';
  return 'Venta directa';
}

export interface Avatar {
  /** Iniciales (2 letras) o «VD»/«VO» para ventas sin cliente nominal. */
  initials: string;
  /** Tono del avatar: -1 = neutro (gris); 0..7 = índice de la paleta categórica. */
  tone: number;
}

/** Avatar de la fila: iniciales + tono. Gris para ventas sin cliente; color estable
 *  (hash del nombre) para clientes nominales — espeja el avatar del prototipo. */
export function avatarOf(row: SalesViewRow): Avatar {
  const name = row.customerName?.trim();
  if (!name) {
    return { initials: row.channel === 'ONLINE' ? 'VO' : 'VD', tone: -1 };
  }
  const words = name.split(/\s+/).filter(Boolean);
  const initials =
    ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { initials, tone: h % 8 };
}

/** Color de fondo del avatar a partir del tono: neutro (gris) o paleta categórica. */
export function avatarBg(tone: number): string {
  return tone < 0 ? 'var(--ui-text-soft)' : `var(--ui-cat-${tone + 1})`;
}

export interface FacetOption {
  key: string;
  label: string;
  count: number;
  /** Para Estado de cobro / Canal: punto de color (clase de estado o índice de canal). */
  cobro?: CobroStatus;
  channel?: string;
}

export interface FacetGroup {
  key: FacetKey;
  title: string;
  options: FacetOption[];
}

const COBRO_ORDER: CobroStatus[] = ['paid', 'pending', 'overdue', 'void'];
const CHANNEL_ORDER = ['TPV', 'ONLINE', 'B2B'];
const METHOD_ORDER = ['CASH', 'CARD', 'TRANSFER', 'BIZUM', 'DIRECT_DEBIT'];

/** Cuenta apariciones de cada clave manteniendo un orden preferente + alfabético. */
function tally(values: string[], preferred: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ordered = new Map<string, number>();
  for (const k of preferred) if (counts.has(k)) ordered.set(k, counts.get(k)!);
  for (const k of [...counts.keys()].filter((k) => !preferred.includes(k)).sort())
    ordered.set(k, counts.get(k)!);
  return ordered;
}

/**
 * Grupos de facetas con recuentos sobre el conjunto completo cargado (no co-filtrado,
 * como el prototipo): Estado de cobro · Canal · Tienda · Vendedor · Método de pago.
 * Tienda/Vendedor/Método solo listan los valores presentes en los datos.
 */
export function computeSalesFacets(rows: SalesViewRow[], today: string = todayIso()): FacetGroup[] {
  const cobroCounts = new Map<CobroStatus, number>();
  for (const r of rows) {
    const cs = cobroStatusOf(r, today);
    cobroCounts.set(cs, (cobroCounts.get(cs) ?? 0) + 1);
  }
  const cobro: FacetGroup = {
    key: 'cobro',
    title: 'Estado de cobro',
    options: COBRO_ORDER.filter((s) => (cobroCounts.get(s) ?? 0) > 0).map((s) => ({
      key: s,
      label: COBRO_LABELS[s],
      count: cobroCounts.get(s) ?? 0,
      cobro: s,
    })),
  };

  const channel: FacetGroup = {
    key: 'channel',
    title: 'Canal',
    options: [
      ...tally(
        rows.map((r) => r.channel),
        CHANNEL_ORDER,
      ),
    ].map(([k, count]) => ({
      key: k,
      label: CHANNEL_LABELS[k] ?? k,
      count,
      channel: k,
    })),
  };

  const store: FacetGroup = {
    key: 'store',
    title: 'Tienda',
    options: [...tally(rows.map((r) => r.storeName).filter(Boolean), [])].map(([k, count]) => ({
      key: k,
      label: k,
      count,
    })),
  };

  const seller: FacetGroup = {
    key: 'seller',
    title: 'Vendedor',
    options: [...tally(rows.map((r) => r.sellerName).filter(Boolean), [])].map(([k, count]) => ({
      key: k,
      label: k,
      count,
    })),
  };

  const method: FacetGroup = {
    key: 'method',
    title: 'Método de pago',
    options: [
      ...tally(
        rows.map((r) => r.paymentMethod),
        METHOD_ORDER,
      ),
    ].map(([k, count]) => ({
      key: k,
      label: METHOD_LABELS[k] ?? k,
      count,
    })),
  };

  return [cobro, channel, store, seller, method].filter((g) => g.options.length > 0);
}

export interface SavedView {
  id: SavedViewId;
  label: string;
  count: number;
  /** Estado de cobro asociado (para el punto de color); `all` no lleva. */
  cobro?: CobroStatus;
}

/** Vistas guardadas del carril con recuentos: Todas · Pendientes · Vencidas · Anuladas. */
export function computeSavedViews(rows: SalesViewRow[], today: string = todayIso()): SavedView[] {
  const by = (s: CobroStatus): number => rows.filter((r) => cobroStatusOf(r, today) === s).length;
  return [
    { id: 'all', label: 'Todas las ventas', count: rows.length },
    { id: 'pending', label: 'Pendientes de cobro', count: by('pending'), cobro: 'pending' },
    { id: 'overdue', label: 'Vencidas', count: by('overdue'), cobro: 'overdue' },
    { id: 'void', label: 'Anuladas', count: by('void'), cobro: 'void' },
  ];
}

const VIEW_TO_COBRO: Record<Exclude<SavedViewId, 'all'>, CobroStatus> = {
  pending: 'pending',
  overdue: 'overdue',
  void: 'void',
};

/** Filtra las ventas por vista guardada + facetas activas + búsqueda libre. */
export function filterSales(
  rows: SalesViewRow[],
  view: SavedViewId,
  facets: SalesFacetState,
  search: string,
  today: string = todayIso(),
): SalesViewRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    const cs = cobroStatusOf(r, today);
    if (view !== 'all' && cs !== VIEW_TO_COBRO[view]) return false;
    if (q) {
      const hay = `${customerOf(r)} ${r.ticketNumber} ${r.sellerName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (facets.cobro.size && !facets.cobro.has(cs)) return false;
    if (facets.channel.size && !facets.channel.has(r.channel)) return false;
    if (facets.store.size && !facets.store.has(r.storeName)) return false;
    if (facets.seller.size && !facets.seller.has(r.sellerName)) return false;
    if (facets.method.size && !facets.method.has(r.paymentMethod)) return false;
    return true;
  });
}

/** Dirección de orden del ledger por fecha de creación. */
export type SortDir = 'desc' | 'asc';

/**
 * Ordena las ventas por `createdAt` en cliente (el backend solo sirve DESC fijo).
 * Inmutable: copia con spread, no muta el array de entrada. `desc` = más reciente
 * primero (orden por defecto), `asc` = más antigua primero.
 */
export function sortSalesByDate(rows: SalesViewRow[], dir: SortDir): SalesViewRow[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return dir === 'desc' ? tb - ta : ta - tb;
  });
}

export interface CobroChips {
  paid: number;
  pending: number;
  overdue: number;
}

/** Suma Cobrado/Pendiente/Vencido sobre las filas dadas (las anuladas no suman). */
export function cobroTotals(rows: SalesViewRow[], today: string = todayIso()): CobroChips {
  let paid = 0;
  let pending = 0;
  let overdue = 0;
  for (const r of rows) {
    if (r.status === 'VOIDED') continue;
    const amount = Number(r.total) || 0;
    const cs = cobroStatusOf(r, today);
    if (cs === 'paid') paid += amount;
    else if (cs === 'overdue') overdue += amount;
    else if (cs === 'pending') pending += amount;
  }
  return { paid, pending, overdue };
}

/** ¿Hay algún filtro activo (vista ≠ Todas, búsqueda o alguna faceta marcada)? */
export function hasActiveFilters(
  view: SavedViewId,
  facets: SalesFacetState,
  search: string,
): boolean {
  return (
    view !== 'all' ||
    search.trim() !== '' ||
    facets.cobro.size > 0 ||
    facets.channel.size > 0 ||
    facets.store.size > 0 ||
    facets.seller.size > 0 ||
    facets.method.size > 0
  );
}

/** Alterna una clave en un Set de forma inmutable (helper de selección de facetas). */
export function toggleInSet<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
