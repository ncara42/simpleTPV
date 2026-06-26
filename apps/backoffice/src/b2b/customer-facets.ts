//! Lógica pura del rediseño Clientes B2B (maestro-detalle). Cruza `Customer` con su
//! agregado de cartera (`CustomerLedgerRow`), filtra por las facetas del carril y
//! deriva los recuentos. Sin React: se testea en aislamiento.

import type { Customer, CustomerLedgerRow } from '../lib/b2b.js';

/** Cliente + agregados de cartera (ceros si no tiene pedidos). */
export interface CustomerView extends Customer {
  orderCount: number;
  lastOrderAt: string | null;
  billed12m: number;
  balance: number;
  overdue: number;
}

export type EstadoFilter = 'all' | 'active' | 'inactive';
export type SaldoFilter = 'all' | 'con' | 'vencido' | 'sin';
export type FechaFilter = 'all' | '30' | '90' | 'old' | 'none';

export interface CustomerFacetState {
  search: string;
  estado: EstadoFilter;
  saldo: SaldoFilter;
  fecha: FechaFilter;
  tarifas: ReadonlySet<string>;
  segmentos: ReadonlySet<string>;
}

export const EMPTY_FACETS: CustomerFacetState = {
  search: '',
  estado: 'all',
  saldo: 'all',
  fecha: 'all',
  tarifas: new Set(),
  segmentos: new Set(),
};

export type SavedViewId = 'all' | 'deuda' | 'vencido' | 'vip' | 'horeca' | 'inactivos';

const DAY_MS = 86_400_000;
const OLD_DAYS = 180;

/** Días transcurridos desde una fecha ISO hasta `now` (redondeo a días enteros). */
export function daysAgo(iso: string, now: number): number {
  return Math.round((now - new Date(iso).getTime()) / DAY_MS);
}

/** Cruza clientes con su agregado de cartera por `customerId`. */
export function mergeCustomers(
  customers: readonly Customer[],
  ledger: readonly CustomerLedgerRow[],
): CustomerView[] {
  const byId = new Map(ledger.map((l) => [l.customerId, l]));
  return customers.map((c) => {
    const l = byId.get(c.id);
    return {
      ...c,
      // Defensa: una API previa al rediseño no devuelve estos campos. Normalizamos
      // aquí (fuente única) para que el resto de la vista nunca opere sobre
      // undefined (p. ej. `tags.map`/`.includes`).
      tags: c.tags ?? [],
      paymentTerms: c.paymentTerms ?? null,
      salesRep: c.salesRep ?? null,
      creditLimit: c.creditLimit ?? null,
      orderCount: l?.orderCount ?? 0,
      lastOrderAt: l?.lastOrderAt ?? null,
      billed12m: l ? Number(l.billed12m) : 0,
      balance: l ? Number(l.balance) : 0,
      overdue: l ? Number(l.overdue) : 0,
    };
  });
}

/** Base de búsqueda (solo texto): sobre ella se cuentan las facetas. */
export function searchBase(rows: readonly CustomerView[], search: string): CustomerView[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter((c) =>
    [c.name, c.nif, c.email, c.phone, c.address, c.salesRep].some((f) =>
      (f ?? '').toLowerCase().includes(q),
    ),
  );
}

/** ¿La fila pasa el filtro de saldo? */
function matchesSaldo(c: CustomerView, saldo: SaldoFilter): boolean {
  if (saldo === 'con') return c.balance > 0;
  if (saldo === 'vencido') return c.overdue > 0;
  if (saldo === 'sin') return c.balance === 0;
  return true;
}

/** ¿La fila pasa el filtro de "último pedido"? */
function matchesFecha(c: CustomerView, fecha: FechaFilter, now: number): boolean {
  if (fecha === 'all') return true;
  if (fecha === 'none') return c.lastOrderAt === null;
  if (c.lastOrderAt === null) return false;
  const d = daysAgo(c.lastOrderAt, now);
  if (fecha === '30') return d <= 30;
  if (fecha === '90') return d <= 90;
  if (fecha === 'old') return d > OLD_DAYS;
  return true;
}

/** Aplica todas las facetas + búsqueda a una fila. */
export function matches(c: CustomerView, f: CustomerFacetState, now: number): boolean {
  const q = f.search.trim().toLowerCase();
  if (
    q &&
    ![c.name, c.nif, c.email, c.phone, c.address, c.salesRep].some((field) =>
      (field ?? '').toLowerCase().includes(q),
    )
  ) {
    return false;
  }
  if (f.estado === 'active' && !c.active) return false;
  if (f.estado === 'inactive' && c.active) return false;
  if (f.tarifas.size > 0 && !(c.priceListId !== null && f.tarifas.has(c.priceListId))) return false;
  if (f.segmentos.size > 0 && !c.tags.some((t) => f.segmentos.has(t))) return false;
  if (!matchesSaldo(c, f.saldo)) return false;
  if (!matchesFecha(c, f.fecha, now)) return false;
  return true;
}

export function filterCustomers(
  rows: readonly CustomerView[],
  f: CustomerFacetState,
  now: number,
): CustomerView[] {
  return rows.filter((c) => matches(c, f, now));
}

/** Nº de facetas activas (para el botón "Limpiar filtros · N"). */
export function activeFacetCount(f: CustomerFacetState): number {
  return (
    (f.estado !== 'all' ? 1 : 0) +
    (f.saldo !== 'all' ? 1 : 0) +
    (f.fecha !== 'all' ? 1 : 0) +
    f.tarifas.size +
    f.segmentos.size
  );
}

/** Estado de facetas que aplica una vista guardada. */
export function applySavedView(id: SavedViewId): CustomerFacetState {
  const base: CustomerFacetState = { ...EMPTY_FACETS, tarifas: new Set(), segmentos: new Set() };
  switch (id) {
    case 'deuda':
      return { ...base, saldo: 'con' };
    case 'vencido':
      return { ...base, saldo: 'vencido' };
    case 'vip':
      return { ...base, segmentos: new Set(['VIP']) };
    case 'horeca':
      return { ...base, segmentos: new Set(['HORECA']) };
    case 'inactivos':
      return { ...base, estado: 'inactive' };
    default:
      return base;
  }
}

/** ¿Qué vista guardada está activa con el estado actual? `null` si es una combinación libre. */
export function activeSavedView(f: CustomerFacetState): SavedViewId | null {
  const onlySaldo = f.estado === 'all' && f.fecha === 'all' && f.tarifas.size === 0;
  const onlySeg = onlySaldo && f.saldo === 'all';
  if (onlySeg && f.segmentos.size === 1 && f.segmentos.has('VIP')) return 'vip';
  if (onlySeg && f.segmentos.size === 1 && f.segmentos.has('HORECA')) return 'horeca';
  if (onlySaldo && f.segmentos.size === 0 && f.saldo === 'con') return 'deuda';
  if (onlySaldo && f.segmentos.size === 0 && f.saldo === 'vencido') return 'vencido';
  if (
    f.estado === 'inactive' &&
    f.saldo === 'all' &&
    f.fecha === 'all' &&
    f.tarifas.size === 0 &&
    f.segmentos.size === 0
  )
    return 'inactivos';
  if (activeFacetCount(f) === 0) return 'all';
  return null;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/** Iniciales del nombre (1-2 letras), ignorando símbolos. */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, '')
    .trim()
    .split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** Fecha relativa del último pedido. `null` → "Sin pedidos". */
export function relOrderDate(iso: string | null, now: number): string {
  if (iso === null) return 'Sin pedidos';
  const d = daysAgo(iso, now);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 14) return `hace ${d} d`;
  if (d < 60) return `hace ${Math.round(d / 7)} sem`;
  if (d < 365) return `hace ${Math.round(d / 30)} meses`;
  const years = Math.floor(d / 365);
  return `hace ${years} año${years > 1 ? 's' : ''}`;
}

const FULL_DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function fmtFullDate(iso: string | null): string {
  if (iso === null) return '—';
  return FULL_DATE_FMT.format(new Date(iso));
}

/** Etiqueta de forma de pago a partir de los días de crédito. */
export function paymentTermsLabel(days: number | null): string {
  if (days === null || days <= 0) return 'Contado';
  return `${days} días`;
}

export type TagTone = 'vip' | 'risk' | 'new' | 'neutral';

/** Tono semántico del badge de segmento. */
export function tagTone(tag: string): TagTone {
  if (tag === 'VIP') return 'vip';
  if (tag === 'Riesgo') return 'risk';
  if (tag === 'Nuevo') return 'new';
  return 'neutral';
}

/** Tono del saldo: vencido = peligro, con saldo = neutro, al día = apagado. */
export function balanceTone(c: CustomerView): 'danger' | 'muted' | 'plain' {
  if (c.overdue > 0) return 'danger';
  if (c.balance > 0) return 'plain';
  return 'muted';
}
