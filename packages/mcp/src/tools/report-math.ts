// Cálculo puro del informe mensual de ventas (mes en curso vs mes anterior).
// Sin I/O: el handler de la tool le pasa los totales crudos de la API y la fecha
// actual, y aquí derivamos la comparativa "en bruto", la media diaria comparable,
// la proyección a fin de mes y las series acumuladas día a día.
//
// Toda la aritmética temporal es en UTC para casar con la resolución de periodos
// del backend (`period=month`/`last_month` se resuelven en UTC).

export interface PeriodKpisRaw {
  revenue: number;
  salesCount: number;
  marginPct: number;
}

export interface DailyPoint {
  /** Fecha ISO `YYYY-MM-DD` (solo días con ventas). */
  day: string;
  revenue: number;
}

export interface PeriodSummary {
  label: string;
  revenue: number;
  salesCount: number;
  marginPct: number;
  daysInMonth: number;
}

export interface ReportMetrics {
  current: PeriodSummary & { daysElapsed: number };
  previous: PeriodSummary;
  /** Medias diarias comparables + proyección a fin de mes si se mantiene el ritmo. */
  dailyAvg: {
    revenue: { current: number; previous: number; projection: number };
    tickets: { current: number; previous: number; projection: number };
  };
  /** Acumulado de facturación por día-del-mes: `current` se corta en el día en curso. */
  cumulative: { current: number[]; previous: number[] };
}

/** Nº de días naturales del mes `month0` (0–11) de `year`. */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Nombre del mes en español (capitalizado): `junio`, `mayo`… en UTC. */
export function monthLabel(year: number, month0: number): string {
  const name = new Date(Date.UTC(year, month0, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    timeZone: 'UTC',
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** División protegida: devuelve 0 si el divisor es 0 (evita NaN/Infinity en la UI). */
function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Acumula la facturación por día-del-mes hasta `totalDays`, rellenando con 0 los
 * días sin ventas (la serie es monótona no decreciente). El día se extrae del ISO
 * `YYYY-MM-DD`, así que el mes/año del punto no importa: se alinea por día del mes.
 */
export function cumulativeByDay(daily: DailyPoint[], totalDays: number): number[] {
  const byDom = new Map<number, number>();
  for (const d of daily) {
    const dom = Number(d.day.slice(8, 10));
    if (!Number.isFinite(dom) || dom < 1) continue;
    byDom.set(dom, (byDom.get(dom) ?? 0) + (d.revenue ?? 0));
  }
  const out: number[] = [];
  let acc = 0;
  for (let dom = 1; dom <= totalDays; dom += 1) {
    acc += byDom.get(dom) ?? 0;
    out.push(round2(acc));
  }
  return out;
}

/**
 * Construye las métricas del informe mensual a partir de los totales del mes en
 * curso y del mes anterior completo, más las series diarias de ambos.
 */
export function buildReportMetrics(args: {
  now: Date;
  current: PeriodKpisRaw;
  previous: PeriodKpisRaw;
  dailyCurrent: DailyPoint[];
  dailyPrevious: DailyPoint[];
}): ReportMetrics {
  const { now, current, previous, dailyCurrent, dailyPrevious } = args;

  const curYear = now.getUTCFullYear();
  const curMonth0 = now.getUTCMonth();
  const daysElapsed = now.getUTCDate();
  const daysInCur = daysInMonth(curYear, curMonth0);

  // Mes anterior (1 del mes en curso menos un día).
  const prevDate = new Date(Date.UTC(curYear, curMonth0, 0));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth0 = prevDate.getUTCMonth();
  const daysInPrev = daysInMonth(prevYear, prevMonth0);

  const revPerDayCur = safeDiv(current.revenue, daysElapsed);
  const revPerDayPrev = safeDiv(previous.revenue, daysInPrev);
  const ticketsPerDayCur = safeDiv(current.salesCount, daysElapsed);
  const ticketsPerDayPrev = safeDiv(previous.salesCount, daysInPrev);

  return {
    current: {
      label: monthLabel(curYear, curMonth0),
      revenue: current.revenue,
      salesCount: current.salesCount,
      marginPct: current.marginPct,
      daysElapsed,
      daysInMonth: daysInCur,
    },
    previous: {
      label: monthLabel(prevYear, prevMonth0),
      revenue: previous.revenue,
      salesCount: previous.salesCount,
      marginPct: previous.marginPct,
      daysInMonth: daysInPrev,
    },
    dailyAvg: {
      revenue: {
        current: round2(revPerDayCur),
        previous: round2(revPerDayPrev),
        projection: round2(revPerDayCur * daysInCur),
      },
      tickets: {
        current: round2(ticketsPerDayCur),
        previous: round2(ticketsPerDayPrev),
        projection: round2(ticketsPerDayCur * daysInCur),
      },
    },
    cumulative: {
      current: cumulativeByDay(dailyCurrent, daysElapsed),
      previous: cumulativeByDay(dailyPrevious, daysInPrev),
    },
  };
}
