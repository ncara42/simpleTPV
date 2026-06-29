//! Lógica pura del rediseño Promociones (maestro-detalle, diseño Geist). Filtra por las
//! facetas del carril (Estado · Condición · Descuento + «vencen pronto»), deriva recuentos,
//! ordena la lista y formatea el dominio. Sin React: se testea en aislamiento. `today`
//! siempre inyectable ('YYYY-MM-DD') para que los tests no dependan del reloj.

import {
  type PromoConditionType,
  type PromoDiscountType,
  type PromoStatus,
  promoStatus,
  type Promotion,
} from '../lib/promotions.js';

export type { PromoConditionType, PromoDiscountType, PromoStatus };

/** Hoy en horario local como 'YYYY-MM-DD' (misma convención que `lib/promotions`). */
export function todayLocal(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─── Estado de facetas ─────────────────────────────────────────────────────────
export interface PromoFacetState {
  search: string;
  estados: ReadonlySet<PromoStatus>;
  condiciones: ReadonlySet<PromoConditionType>;
  descuentos: ReadonlySet<PromoDiscountType>;
  /** «Vencen pronto»: activas que terminan en ≤30 días. */
  soon: boolean;
}

export const EMPTY_PROMO_FACETS: PromoFacetState = {
  search: '',
  estados: new Set(),
  condiciones: new Set(),
  descuentos: new Set(),
  soon: false,
};

export type PromoSavedViewId =
  | 'all'
  | 'activas'
  | 'programadas'
  | 'pausadas'
  | 'expiradas'
  | 'vencen';
export type PromoSortMode = 'estado' | 'vigencia';
export type PromoFacetGroupKey = 'estados' | 'condiciones' | 'descuentos';

const SOON_DAYS = 30;
const DAY_MS = 86_400_000;

// ─── Fechas (parseo local para no desplazar el día por zona horaria) ───────────
export function parseLocal(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}
/** Días enteros desde `today` hasta `target` (negativo si ya pasó). */
export function daysTo(target: string, today: string): number {
  return Math.round((parseLocal(target).getTime() - parseLocal(today).getTime()) / DAY_MS);
}
/** Días enteros entre dos fechas `a → b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / DAY_MS);
}

// ─── Formatters de dominio ─────────────────────────────────────────────────────
type Condition = Pick<Promotion, 'conditionType' | 'threshold'>;
type Discount = Pick<Promotion, 'discountType' | 'discountValue'>;

/** Condición condensada para fila/stat («≥ 3 ud», «≥ 40 € ticket»). */
export function condShort(p: Condition): string {
  return p.conditionType === 'min_qty' ? `≥ ${p.threshold} ud` : `≥ ${p.threshold} € ticket`;
}
/** Condición en cláusula completa (cabecera «Si se cumple» / preview del modal). */
export function condClause(p: Condition): string {
  return p.conditionType === 'min_qty'
    ? `El ticket lleva ${p.threshold} o más productos`
    : `El importe del ticket supera los ${p.threshold} €`;
}
/** Descuento condensado para la píldora de fila («−20%», «−5 €»). */
export function discShort(p: Discount): string {
  return p.discountType === 'percent' ? `−${p.discountValue}%` : `−${p.discountValue} €`;
}
/** Descuento en frase («20% de descuento», «5 € de descuento»). */
export function discPhrase(p: Discount): string {
  return p.discountType === 'percent'
    ? `${p.discountValue}% de descuento`
    : `${p.discountValue} € de descuento`;
}

const fmtDM = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtDMY = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Vigencia compacta «1 jun. – 31 jul. 2026» (omite el año del inicio si coincide). */
export function dateRange(start: string, end: string): string {
  const s = parseLocal(start);
  const e = parseLocal(end);
  const startLabel = s.getFullYear() === e.getFullYear() ? fmtDM.format(s) : fmtDMY.format(s);
  return `${startLabel} – ${fmtDMY.format(e)}`;
}
export function fmtFullDate(d: string): string {
  return fmtDMY.format(parseLocal(d));
}
/** «1 día» / «5 días» (sobre el valor absoluto). */
export function plural(n: number, singular: string, pluralForm: string): string {
  const a = Math.abs(n);
  return `${a} ${a === 1 ? singular : pluralForm}`;
}

// ─── Metadatos de estado ───────────────────────────────────────────────────────
export interface PromoStatusMeta {
  label: string;
  status: PromoStatus;
  /** Estado finalizado: recede (texto apagado + punto hueco). */
  muted: boolean;
}
const STATUS_META: Record<PromoStatus, PromoStatusMeta> = {
  activa: { label: 'Activa', status: 'activa', muted: false },
  programada: { label: 'Programada', status: 'programada', muted: false },
  pausada: { label: 'Pausada', status: 'pausada', muted: false },
  expirada: { label: 'Expirada', status: 'expirada', muted: true },
};
export function statusMeta(s: PromoStatus): PromoStatusMeta {
  return STATUS_META[s];
}

/** ¿Activa y a ≤30 días de terminar? (vista «Vencen pronto»). */
export function isExpiringSoon(p: Promotion, today: string): boolean {
  if (promoStatus(p, today) !== 'activa') return false;
  const d = daysTo(p.endDate, today);
  return d >= 0 && d <= SOON_DAYS;
}

// ─── Búsqueda · filtrado · orden ───────────────────────────────────────────────
/** Base de búsqueda (solo texto): sobre ella se cuentan las facetas. */
export function searchBase(rows: readonly Promotion[], search: string): Promotion[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter((p) => p.name.toLowerCase().includes(q));
}

/** ¿La promoción pasa búsqueda + todas las facetas? */
export function matches(p: Promotion, f: PromoFacetState, today: string): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !p.name.toLowerCase().includes(q)) return false;
  const s = promoStatus(p, today);
  if (f.estados.size > 0 && !f.estados.has(s)) return false;
  if (f.condiciones.size > 0 && !f.condiciones.has(p.conditionType)) return false;
  if (f.descuentos.size > 0 && !f.descuentos.has(p.discountType)) return false;
  if (f.soon && !isExpiringSoon(p, today)) return false;
  return true;
}

export function filterPromotions(
  rows: readonly Promotion[],
  f: PromoFacetState,
  today: string,
): Promotion[] {
  return rows.filter((p) => matches(p, f, today));
}

// Estado primero (activa → programada → pausada → expirada), luego por fin más próximo.
const STATUS_ORDER: Record<PromoStatus, number> = {
  activa: 0,
  programada: 1,
  pausada: 2,
  expirada: 3,
};
export function sortPromotions(
  rows: readonly Promotion[],
  mode: PromoSortMode,
  today: string,
): Promotion[] {
  return rows.slice().sort((a, b) => {
    if (mode === 'vigencia') {
      return (
        daysTo(a.endDate, today) - daysTo(b.endDate, today) || a.name.localeCompare(b.name, 'es')
      );
    }
    return (
      STATUS_ORDER[promoStatus(a, today)] - STATUS_ORDER[promoStatus(b, today)] ||
      daysTo(a.endDate, today) - daysTo(b.endDate, today) ||
      a.name.localeCompare(b.name, 'es')
    );
  });
}

/** Nº de facetas activas (para el botón «Limpiar filtros · N»). */
export function activeFacetCount(f: PromoFacetState): number {
  return f.estados.size + f.condiciones.size + f.descuentos.size + (f.soon ? 1 : 0);
}

/** Recuento por grupo de resumen de la lista (activas · programadas · inactivas). */
export interface PromoChips {
  activa: number;
  programada: number;
  inactiva: number;
}
export function statusChips(rows: readonly Promotion[], today: string): PromoChips {
  const chips: PromoChips = { activa: 0, programada: 0, inactiva: 0 };
  for (const p of rows) {
    const s = promoStatus(p, today);
    if (s === 'activa') chips.activa += 1;
    else if (s === 'programada') chips.programada += 1;
    else chips.inactiva += 1;
  }
  return chips;
}

// ─── Vistas guardadas ──────────────────────────────────────────────────────────
/** Estado de facetas que aplica una vista guardada (la búsqueda la preserva el contenedor). */
export function applySavedView(id: PromoSavedViewId): PromoFacetState {
  const base: PromoFacetState = {
    ...EMPTY_PROMO_FACETS,
    estados: new Set(),
    condiciones: new Set(),
    descuentos: new Set(),
  };
  switch (id) {
    case 'activas':
      return { ...base, estados: new Set<PromoStatus>(['activa']) };
    case 'programadas':
      return { ...base, estados: new Set<PromoStatus>(['programada']) };
    case 'pausadas':
      return { ...base, estados: new Set<PromoStatus>(['pausada']) };
    case 'expiradas':
      return { ...base, estados: new Set<PromoStatus>(['expirada']) };
    case 'vencen':
      return { ...base, soon: true };
    default:
      return base;
  }
}

/** ¿Qué vista guardada está activa? `null` si es una combinación libre de facetas. */
export function activeSavedView(f: PromoFacetState): PromoSavedViewId | null {
  const noGroups = f.condiciones.size === 0 && f.descuentos.size === 0;
  if (f.soon && noGroups && f.estados.size === 0) return 'vencen';
  if (!f.soon && noGroups && f.estados.size === 0) return 'all';
  if (!f.soon && noGroups && f.estados.size === 1) {
    const [s] = [...f.estados];
    const map: Record<PromoStatus, PromoSavedViewId> = {
      activa: 'activas',
      programada: 'programadas',
      pausada: 'pausadas',
      expirada: 'expiradas',
    };
    return s ? map[s] : null;
  }
  return null;
}
