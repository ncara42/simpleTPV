import type { DashboardPeriod } from './dashboard.js';

// ── Ventanas históricas del scrub de KPIs ──────────────────────────────────────
//
// El sparkline de cada KPI puede "tirar hacia atrás" en el tiempo, ventana a ventana. La UNIDAD de
// ventana = la granularidad del periodo activo del dashboard:
//   today/yesterday → día   ·   week → semana ISO   ·   month → mes natural   ·   year → año natural
//
// `offset` es cuántas ventanas atrás (0 = la ventana en vivo, que NO usa este módulo: la sirve la
// query normal del periodo). Para offset ≥ 1 devolvemos el rango COMPLETO de esa ventana pasada
// (mes entero, semana lunes→domingo, etc.) más una etiqueta corta para pintar en la card.

export type WindowUnit = 'day' | 'week' | 'month' | 'year';

export function windowUnit(period: DashboardPeriod): WindowUnit {
  if (period === 'today' || period === 'yesterday') return 'day';
  if (period === 'week') return 'week';
  if (period === 'month') return 'month';
  return 'year';
}

// Tope de ventanas hacia atrás ≈ 12 meses de historial (con holgura para año).
export function maxBackOffset(period: DashboardPeriod): number {
  switch (windowUnit(period)) {
    case 'day':
      return 365;
    case 'week':
      return 52;
    case 'month':
      return 12;
    case 'year':
      return 4;
  }
}

export interface HistoryWindow {
  from: string;
  to: string;
  label: string;
}

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Lunes de la semana ISO que contiene `d` (réplica de period.ts para no acoplar módulos).
const startOfIsoWeek = (d: Date): Date => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (c.getDay() + 6) % 7; // 0 = lunes
  c.setDate(c.getDate() - dow);
  return c;
};

/**
 * Rango completo de la ventana `offset` (≥ 1) hacia atrás, según la granularidad del `period`.
 * `now` es inyectable para tests deterministas.
 */
export function historyWindow(
  period: DashboardPeriod,
  offset: number,
  now: Date = new Date(),
): HistoryWindow {
  const unit = windowUnit(period);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (unit === 'day') {
    const base = new Date(today);
    if (period === 'yesterday') base.setDate(base.getDate() - 1);
    base.setDate(base.getDate() - offset);
    const iso = toIso(base);
    const sameYear = base.getFullYear() === today.getFullYear();
    const label = sameYear
      ? `${base.getDate()} ${MONTHS_ES[base.getMonth()]}`
      : `${base.getDate()} ${MONTHS_ES[base.getMonth()]} ${String(base.getFullYear()).slice(2)}`;
    return { from: iso, to: iso, label };
  }

  if (unit === 'week') {
    const mon = startOfIsoWeek(today);
    mon.setDate(mon.getDate() - offset * 7);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const label =
      mon.getMonth() === sun.getMonth()
        ? `${mon.getDate()}–${sun.getDate()} ${MONTHS_ES[sun.getMonth()]}`
        : `${mon.getDate()} ${MONTHS_ES[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_ES[sun.getMonth()]}`;
    return { from: toIso(mon), to: toIso(sun), label };
  }

  if (unit === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const sameYear = first.getFullYear() === today.getFullYear();
    const mon = MONTHS_ES[first.getMonth()] ?? '';
    const label = sameYear ? mon : `${mon} ${String(first.getFullYear()).slice(2)}`;
    return { from: toIso(first), to: toIso(last), label };
  }

  // year
  const y = today.getFullYear() - offset;
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}
