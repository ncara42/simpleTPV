//! Lógica pura del rediseño Tarifas B2B (maestro-detalle, espejo de Clientes). El
//! backend no almacena «tipo», «descuento» ni «facturado» por tarifa: aquí los
//! DERIVAMOS de datos reales — el descuento medio y el tipo salen de cruzar cada
//! precio con el PVP del producto; el facturado 12m, de sumar la cartera de los
//! clientes asignados a la tarifa. Sin React: se testea en aislamiento.

import type {
  Customer,
  CustomerLedgerRow,
  PriceListDetail,
  PriceListItem,
  PriceListSummary,
} from '../lib/b2b.js';

// Una tarifa con descuento medio < 0,5% se considera «base» (PVP): variaciones de
// redondeo no deben colarla como tarifa de descuento.
const DISCOUNT_EPSILON = 0.005;

export type PriceListTipo = 'base' | 'descuento';

/** Tarifa + agregados derivados (descuento medio, tipo, facturado, items crudos). */
export interface PriceListView {
  id: string;
  name: string;
  active: boolean;
  itemCount: number;
  customerCount: number;
  /** Media de (1 − precio/PVP) sobre los items con PVP conocido. 0..1. */
  avgDiscount: number;
  tipo: PriceListTipo;
  /** Facturado 12m derivado de la cartera de los clientes asignados. */
  billed12m: number;
  /** Items crudos (para la tabla «Precios por producto» de la ficha). */
  items: PriceListItem[];
}

export type EstadoFilter = 'all' | 'active' | 'inactive';
export type AsignFilter = 'all' | 'con' | 'sin';

export interface PriceListFacetState {
  search: string;
  estado: EstadoFilter;
  tipos: ReadonlySet<PriceListTipo>;
  asignacion: AsignFilter;
}

export const EMPTY_FACETS: PriceListFacetState = {
  search: '',
  estado: 'all',
  tipos: new Set(),
  asignacion: 'all',
};

export type SavedViewId = 'all' | 'activas' | 'conclientes' | 'sinclientes' | 'inactivas';

// ─── Derivaciones ──────────────────────────────────────────────────────────────

/** Descuento de un item respecto a su PVP: `1 − precio/PVP`. `null` si no hay PVP. */
export function itemDiscount(item: PriceListItem): number | null {
  const pvp = Number(item.product?.salePrice);
  const price = Number(item.price);
  if (!Number.isFinite(pvp) || pvp <= 0 || !Number.isFinite(price)) return null;
  return 1 - price / pvp;
}

/** Descuento medio de la tarifa (media de los descuentos por item con PVP). */
export function avgDiscountOf(items: readonly PriceListItem[]): number {
  let sum = 0;
  let n = 0;
  for (const it of items) {
    const d = itemDiscount(it);
    if (d !== null) {
      sum += d;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** Tipo derivado: «descuento» si el descuento medio supera el epsilon; si no, «base». */
export function tipoOf(items: readonly PriceListItem[]): PriceListTipo {
  return avgDiscountOf(items) > DISCOUNT_EPSILON ? 'descuento' : 'base';
}

/** Cruza tarifas (resumen) con sus detalles y la cartera para derivar la vista. */
export function mergePriceLists(
  summaries: readonly PriceListSummary[],
  detailsById: ReadonlyMap<string, PriceListDetail>,
  customers: readonly Customer[],
  ledger: readonly CustomerLedgerRow[],
): PriceListView[] {
  const billedByCustomer = new Map(ledger.map((l) => [l.customerId, Number(l.billed12m)]));
  // Facturado por tarifa = suma del facturado 12m de los clientes que la usan.
  const billedByList = new Map<string, number>();
  for (const c of customers) {
    if (c.priceListId == null) continue;
    const prev = billedByList.get(c.priceListId) ?? 0;
    billedByList.set(c.priceListId, prev + (billedByCustomer.get(c.id) ?? 0));
  }
  return summaries.map((s) => {
    const items = detailsById.get(s.id)?.items ?? [];
    const avgDiscount = avgDiscountOf(items);
    return {
      id: s.id,
      name: s.name,
      active: s.active,
      itemCount: s.itemCount,
      customerCount: s.customerCount,
      avgDiscount,
      tipo: avgDiscount > DISCOUNT_EPSILON ? 'descuento' : 'base',
      billed12m: billedByList.get(s.id) ?? 0,
      items,
    };
  });
}

// ─── Filtrado + facetas ──────────────────────────────────────────────────────────

/** Base de búsqueda (solo texto): sobre ella se cuentan las facetas. */
export function searchBase(rows: readonly PriceListView[], search: string): PriceListView[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter((t) => t.name.toLowerCase().includes(q));
}

/** Aplica búsqueda + todas las facetas a una fila. */
export function matches(t: PriceListView, f: PriceListFacetState): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !t.name.toLowerCase().includes(q)) return false;
  if (f.estado === 'active' && !t.active) return false;
  if (f.estado === 'inactive' && t.active) return false;
  if (f.tipos.size > 0 && !f.tipos.has(t.tipo)) return false;
  if (f.asignacion === 'con' && t.customerCount === 0) return false;
  if (f.asignacion === 'sin' && t.customerCount > 0) return false;
  return true;
}

export function filterPriceLists(
  rows: readonly PriceListView[],
  f: PriceListFacetState,
): PriceListView[] {
  return rows.filter((t) => matches(t, f));
}

/** Nº de facetas activas (para el botón «Limpiar filtros · N»). */
export function activeFacetCount(f: PriceListFacetState): number {
  return (f.estado !== 'all' ? 1 : 0) + (f.asignacion !== 'all' ? 1 : 0) + f.tipos.size;
}

/** Estado de facetas que aplica una vista guardada. */
export function applySavedView(id: SavedViewId): PriceListFacetState {
  const base: PriceListFacetState = { ...EMPTY_FACETS, tipos: new Set() };
  switch (id) {
    case 'activas':
      return { ...base, estado: 'active' };
    case 'inactivas':
      return { ...base, estado: 'inactive' };
    case 'conclientes':
      return { ...base, asignacion: 'con' };
    case 'sinclientes':
      return { ...base, asignacion: 'sin' };
    default:
      return base;
  }
}

/** ¿Qué vista guardada está activa? `null` si es una combinación libre. */
export function activeSavedView(f: PriceListFacetState): SavedViewId | null {
  const noTipo = f.tipos.size === 0;
  if (f.estado === 'active' && f.asignacion === 'all' && noTipo) return 'activas';
  if (f.estado === 'inactive' && f.asignacion === 'all' && noTipo) return 'inactivas';
  if (f.estado === 'all' && f.asignacion === 'con' && noTipo) return 'conclientes';
  if (f.estado === 'all' && f.asignacion === 'sin' && noTipo) return 'sinclientes';
  if (activeFacetCount(f) === 0) return 'all';
  return null;
}

// ─── Formatters / derivados de presentación ───────────────────────────────────────

/** Código corto de la tarifa para el avatar (1-3 caracteres alfanuméricos). */
export function swCode(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
  if (clean.length === 0) return '·';
  return clean.slice(0, 3);
}

/** Etiqueta del tipo. */
export function tipoLabel(tipo: PriceListTipo): string {
  return tipo === 'descuento' ? 'Descuento' : 'Base';
}

/** Píldora de descuento: «−18%» o «—» cuando es base. */
export function discountLabel(avgDiscount: number): string {
  if (avgDiscount <= DISCOUNT_EPSILON) return '—';
  return `−${Math.round(avgDiscount * 100)}%`;
}

/** Iniciales del nombre (1-2 letras) para los avatares de cliente. */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, '')
    .trim()
    .split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
}

export interface ProductPriceRow {
  productId: string;
  name: string;
  pvp: number | null;
  price: number;
  /** `precio/PVP − 1` (negativo = descuento). `null` si no hay PVP. */
  delta: number | null;
}

/** Filas de la tabla «Precios por producto» de la ficha, ordenadas por nombre. */
export function productRows(view: PriceListView): ProductPriceRow[] {
  return view.items
    .map((it) => {
      const pvp = Number(it.product?.salePrice);
      const price = Number(it.price);
      const hasPvp = Number.isFinite(pvp) && pvp > 0;
      return {
        productId: it.productId,
        name: it.product?.name ?? it.productId,
        pvp: hasPvp ? pvp : null,
        price,
        delta: hasPvp ? price / pvp - 1 : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Signo + porcentaje redondeado: 0 → «0%», negativo → «−18%». */
export function pctSigned(x: number): string {
  if (Math.abs(x) < 0.005) return '0%';
  return (x < 0 ? '−' : '+') + Math.round(Math.abs(x) * 100) + '%';
}
