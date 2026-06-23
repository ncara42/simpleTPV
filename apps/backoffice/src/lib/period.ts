import type { DashboardPeriod } from './dashboard.js';

// ── Metadatos del periodo (fuente única para el control segmentado y el URL-state) ──
//
// `DashboardPeriod` ('today'|'yesterday'|'week'|'month'|'year') es el tipo canónico del
// Dashboard (lib/dashboard.ts). Aquí vive su orden de pintado, sus etiquetas visibles y
// los helpers puros que comparten Dashboard y Ventas, para que la semántica de
// "Hoy/Ayer/Semana/Mes/Año" sea idéntica en ambas pantallas.

export interface PeriodOption {
  value: DashboardPeriod;
  label: string;
}

// Orden de los segmentos (de más estrecho a más amplio). Es la lista por defecto que pinta
// `PeriodSegmented` cuando el consumidor no pasa `options`.
export const PERIOD_OPTIONS: readonly PeriodOption[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
];

// Valores válidos, derivados de `PERIOD_OPTIONS` (no duplicar la lista).
const PERIOD_VALUES: readonly DashboardPeriod[] = PERIOD_OPTIONS.map((o) => o.value);

// Type-guard para validar el `?period=` de la URL antes de aceptarlo (límite de sistema).
export function isDashboardPeriod(value: string | null | undefined): value is DashboardPeriod {
  return value != null && (PERIOD_VALUES as readonly string[]).includes(value);
}

// Normaliza un valor de URL (posiblemente nulo/inválido) al periodo por defecto indicado.
export function parsePeriod(
  value: string | null | undefined,
  fallback: DashboardPeriod,
): DashboardPeriod {
  return isDashboardPeriod(value) ? value : fallback;
}

// ── Fechas locales sobre cadenas 'YYYY-MM-DD' (sin desfases de zona horaria) ──
const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Inicio de la semana ISO (lunes) que contiene `d`.
const startOfIsoWeek = (d: Date): Date => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // 0 = lunes
  copy.setDate(copy.getDate() - dow);
  return copy;
};

export interface PeriodRange {
  date?: string;
  from?: string;
  to?: string;
}

/**
 * Mapea un periodo relativo al rango de fechas que entiende `listSales` (date|from|to en
 * 'YYYY-MM-DD'). Semántica documentada (coherente con los getters server-side del Dashboard):
 * - `today`/`yesterday` → un solo día vía `date` (rango cerrado de ese día).
 * - `week`  → semana ISO en curso (lunes → hoy).
 * - `month` → mes natural en curso (día 1 → hoy).
 * - `year`  → año natural en curso (1 ene → hoy).
 * `now` es inyectable para tests deterministas; por defecto la fecha actual.
 */
export function periodToRange(period: DashboardPeriod, now: Date = new Date()): PeriodRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'today') return { date: toIso(today) };
  if (period === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { date: toIso(y) };
  }

  const to = toIso(today);
  if (period === 'week') return { from: toIso(startOfIsoWeek(today)), to };
  if (period === 'month') {
    return { from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  // year
  return { from: toIso(new Date(today.getFullYear(), 0, 1)), to };
}
