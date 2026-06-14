import { BadRequestException } from '@nestjs/common';

// Resolución de periodos del dashboard. Devuelve un rango semiabierto [from, to)
// en hora del servidor. Las funciones son puras (reciben `now`) para que los
// tests no dependan del reloj real.
export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

// Inicio del día (00:00:00.000) de la fecha dada, en hora local del servidor.
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Lunes de la semana de `d` (semana ISO: lunes=inicio). getDay() devuelve 0=dom.
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = s.getDay(); // 0..6 (0=domingo)
  const diff = dow === 0 ? 6 : dow - 1; // días desde el lunes
  return addDays(s, -diff);
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

function startOfYear(d: Date): Date {
  const r = startOfMonth(d);
  r.setMonth(0);
  return r;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

function addYears(d: Date, years: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}

// Resuelve un periodo (+ from/to opcionales para `custom`) a un rango [from, to).
// `to` es exclusivo y siempre el inicio del día siguiente al último día incluido,
// salvo en custom donde lo fija el usuario (también semiabierto).
export function resolvePeriod(
  period: DashboardPeriod,
  now: Date,
  custom?: { from?: string | undefined; to?: string | undefined },
): DateRange {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  switch (period) {
    case 'today':
      return { from: todayStart, to: tomorrowStart };
    case 'yesterday':
      return { from: addDays(todayStart, -1), to: todayStart };
    case 'week':
      return { from: startOfWeek(now), to: tomorrowStart };
    case 'month':
      return { from: startOfMonth(now), to: tomorrowStart };
    case 'custom': {
      if (!custom?.from || !custom?.to) {
        throw new BadRequestException('period=custom requiere from y to (YYYY-MM-DD)');
      }
      const from = startOfDay(new Date(`${custom.from}T00:00:00`));
      // `to` inclusive en intención del usuario → sumamos 1 día para semiabierto.
      const toInclusive = startOfDay(new Date(`${custom.to}T00:00:00`));
      if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) {
        throw new BadRequestException('from/to deben tener formato YYYY-MM-DD válido');
      }
      const to = addDays(toInclusive, 1);
      if (to <= from) {
        throw new BadRequestException('to no puede ser anterior a from');
      }
      return { from, to };
    }
    default:
      throw new BadRequestException(`Periodo no soportado: ${String(period)}`);
  }
}

// Rango "equivalente anterior" para comparativas (p.ej. hoy vs ayer): desplaza el
// rango hacia atrás su propia duración. Para `today` → el día de ayer completo.
export function previousRange(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - durationMs),
    to: new Date(range.from.getTime()),
  };
}

// Modo de comparación del panel de ventas: día (hoy vs ayer), mes (este mes vs
// el anterior) o año (este año vs el anterior). Siempre "a la misma altura".
export type CompareMode = 'day' | 'month' | 'year';

export interface ComparisonStarts {
  currentStart: Date;
  previousStart: Date;
  // Corte "mismo tiempo transcurrido" dentro del periodo anterior: evita comparar
  // un periodo en curso contra uno ya cerrado (el actual saldría siempre peor).
  previousSameElapsed: Date;
}

// Devuelve los anclajes para la comparativa "periodo en curso vs anterior
// equivalente". El periodo actual va desde su inicio hasta AHORA; el anterior
// desde su inicio hasta el mismo tiempo transcurrido. Función pura (recibe `now`).
export function comparisonStarts(compare: CompareMode, now: Date): ComparisonStarts {
  const currentStart =
    compare === 'day'
      ? startOfDay(now)
      : compare === 'month'
        ? startOfMonth(now)
        : startOfYear(now);
  const previousStart =
    compare === 'day'
      ? addDays(currentStart, -1)
      : compare === 'month'
        ? addMonths(currentStart, -1)
        : addYears(currentStart, -1);
  const elapsedMs = now.getTime() - currentStart.getTime();
  const previousSameElapsed = new Date(previousStart.getTime() + elapsedMs);
  return { currentStart, previousStart, previousSameElapsed };
}

// Delta porcentual (current vs previous). null si previous es 0 (evita /0 y el
// "infinito%" que no aporta nada al usuario).
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}
