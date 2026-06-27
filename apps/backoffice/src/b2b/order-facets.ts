//! Lógica pura del rediseño Pedidos salientes B2B (maestro-detalle, espejo de
//! Clientes/Tarifas). El listado de pedidos (`WholesaleOrderSummary`) no trae ni la
//! tarifa aplicada ni una referencia humana: aquí las DERIVAMOS — la tarifa, cruzando
//! el cliente del pedido con su tarifa asignada; la referencia, de un código corto y
//! estable a partir del id (el backend indexa por UUID, los humanos ven «PED-AÑO-NNNN»).
//! Sin React: se testea en aislamiento.

import type {
  Customer,
  PriceListSummary,
  WholesaleOrderStatus,
  WholesaleOrderSummary,
} from '../lib/b2b.js';
import { fmtFullDate } from './customer-facets.js';

export type OrderStatus = WholesaleOrderStatus; // 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED'

/** Clave de la faceta Tarifa para los pedidos sin tarifa (cliente a PVP). */
export const PVP_KEY = 'pvp';

/** Pedido + agregados derivados (tarifa aplicada, referencia y código corto). */
export interface OrderView {
  id: string;
  /** Código corto de 4 cifras, estable por pedido (avatar + sufijo de la referencia). */
  seq: string;
  /** Referencia humana derivada: «PED-2026-0146». */
  ref: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  /** Total numérico (la API lo serializa como string). */
  total: number;
  lineCount: number;
  createdAt: string;
  /** Tarifa del cliente (`null` = PVP, sin tarifa asignada). */
  tariffId: string | null;
  /** Clave de faceta: `tariffId` o `PVP_KEY`. */
  tariffKey: string;
  /** Nombre de la tarifa aplicada, «PVP» cuando el cliente no tiene tarifa. */
  tariffName: string;
}

export type EstadoFilter = 'all' | OrderStatus;
export type PeriodoFilter = 'all' | 'today' | '7' | '30';

export interface OrderFacetState {
  search: string;
  estado: EstadoFilter;
  periodo: PeriodoFilter;
  /** Multi-selección de tarifas por clave (`tariffId` | `PVP_KEY`); vacío = todas. */
  tarifas: ReadonlySet<string>;
}

export const EMPTY_FACETS: OrderFacetState = {
  search: '',
  estado: 'all',
  periodo: 'all',
  tarifas: new Set(),
};

const DAY_MS = 86_400_000;

/** Días enteros transcurridos (suelo) desde una fecha ISO hasta `now`. */
export function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

// ─── Derivaciones ──────────────────────────────────────────────────────────────

/** Código corto determinista de 4 cifras a partir del id (hash FNV-ish → 0000-9999). */
export function orderSeq(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return String(h % 10_000).padStart(4, '0');
}

/** Referencia humana «PED-AÑO-NNNN» (año de creación + código corto). */
export function orderRef(createdAt: string, seq: string): string {
  const year = new Date(createdAt).getFullYear();
  return `PED-${year}-${seq}`;
}

/** Cruza los pedidos con la tarifa de su cliente para derivar la vista. */
export function mergeOrders(
  orders: readonly WholesaleOrderSummary[],
  customers: readonly Customer[],
  priceLists: readonly PriceListSummary[],
): OrderView[] {
  const tariffByCustomer = new Map(customers.map((c) => [c.id, c.priceListId ?? null]));
  const tariffName = new Map(priceLists.map((p) => [p.id, p.name]));
  return orders.map((o) => {
    const tariffId = tariffByCustomer.get(o.customerId) ?? null;
    const seq = orderSeq(o.id);
    return {
      id: o.id,
      seq,
      ref: orderRef(o.createdAt, seq),
      customerId: o.customerId,
      customerName: o.customerName,
      status: o.status,
      total: Number(o.total),
      lineCount: o.lineCount,
      createdAt: o.createdAt,
      tariffId,
      tariffKey: tariffId ?? PVP_KEY,
      tariffName: tariffId ? (tariffName.get(tariffId) ?? '—') : 'PVP',
    };
  });
}

// ─── Filtrado + facetas ──────────────────────────────────────────────────────────

/** ¿La fila pasa el filtro de periodo? */
function matchesPeriodo(o: OrderView, periodo: PeriodoFilter, now: number): boolean {
  if (periodo === 'all') return true;
  const d = daysSince(o.createdAt, now);
  if (periodo === 'today') return d <= 0;
  if (periodo === '7') return d < 7;
  if (periodo === '30') return d < 30;
  return true;
}

/** Base de búsqueda (solo texto): sobre ella se cuentan las facetas. */
export function searchBase(rows: readonly OrderView[], search: string): OrderView[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter(
    (o) =>
      o.customerName.toLowerCase().includes(q) ||
      o.ref.toLowerCase().includes(q) ||
      o.seq.includes(q),
  );
}

/** Aplica búsqueda + todas las facetas a una fila. */
export function matches(o: OrderView, f: OrderFacetState, now: number): boolean {
  const q = f.search.trim().toLowerCase();
  if (
    q &&
    !o.customerName.toLowerCase().includes(q) &&
    !o.ref.toLowerCase().includes(q) &&
    !o.seq.includes(q)
  ) {
    return false;
  }
  if (f.estado !== 'all' && o.status !== f.estado) return false;
  if (f.tarifas.size > 0 && !f.tarifas.has(o.tariffKey)) return false;
  if (!matchesPeriodo(o, f.periodo, now)) return false;
  return true;
}

export function filterOrders(
  rows: readonly OrderView[],
  f: OrderFacetState,
  now: number,
): OrderView[] {
  return rows.filter((o) => matches(o, f, now));
}

/** Nº de facetas activas (para el botón «Limpiar filtros · N»). */
export function activeFacetCount(f: OrderFacetState): number {
  return (f.estado !== 'all' ? 1 : 0) + (f.periodo !== 'all' ? 1 : 0) + f.tarifas.size;
}

// ─── Formatters / derivados de presentación ───────────────────────────────────────

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  SHIPPED: 'Enviado',
  CANCELLED: 'Cancelado',
};

/** Etiqueta del estado. */
export function statusLabel(status: OrderStatus): string {
  return STATUS_LABEL[status];
}

/** Tono semántico del estado (avatar, punto de lista, icono): naranja/azul/verde/gris. */
export type StatusTone = 'draft' | 'confirmed' | 'shipped' | 'cancelled';
const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  CANCELLED: 'cancelled',
};
export function statusTone(status: OrderStatus): StatusTone {
  return STATUS_TONE[status];
}

/** Fecha de creación legible: «23 jun 2026» (reusa el formato de Clientes). */
export function fmtOrderDate(iso: string): string {
  return fmtFullDate(iso);
}

/** Antigüedad relativa: «hoy», «ayer», «hace 3 d», «hace 2 sem»… */
export function relDays(iso: string, now: number): string {
  const d = daysSince(iso, now);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 14) return `hace ${d} d`;
  if (d < 60) return `hace ${Math.round(d / 7)} sem`;
  if (d < 365) return `hace ${Math.round(d / 30)} meses`;
  const years = Math.floor(d / 365);
  return `hace ${years} año${years > 1 ? 's' : ''}`;
}

/** Estado de cada paso del stepper Borrador → Confirmado → Enviado. */
export type StepState = 'done' | 'current' | 'todo' | 'cancelled';

export interface StepperStep {
  key: OrderStatus;
  label: string;
  state: StepState;
}

const STEP_ORDER: readonly OrderStatus[] = ['DRAFT', 'CONFIRMED', 'SHIPPED'];

/** Pasos del seguimiento del pedido. Cancelado → todos los pasos en estado «cancelled». */
export function stepperSteps(status: OrderStatus): StepperStep[] {
  if (status === 'CANCELLED') {
    return STEP_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], state: 'cancelled' as const }));
  }
  const rank = STEP_ORDER.indexOf(status);
  return STEP_ORDER.map((s, i) => {
    let state: StepState;
    if (i < rank) state = 'done';
    else if (i === rank) state = rank === STEP_ORDER.length - 1 ? 'done' : 'current';
    else state = 'todo';
    return { key: s, label: STATUS_LABEL[s], state };
  });
}
