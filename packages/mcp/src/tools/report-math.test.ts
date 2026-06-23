import { describe, expect, it } from 'vitest';

import { buildReportMetrics, cumulativeByDay, daysInMonth, monthLabel } from './report-math.js';

describe('daysInMonth', () => {
  it('cuenta los días naturales de cada mes (UTC)', () => {
    expect(daysInMonth(2026, 5)).toBe(30); // junio
    expect(daysInMonth(2026, 4)).toBe(31); // mayo
    expect(daysInMonth(2026, 1)).toBe(28); // febrero 2026 (no bisiesto)
    expect(daysInMonth(2024, 1)).toBe(29); // febrero 2024 (bisiesto)
  });
});

describe('monthLabel', () => {
  it('devuelve el mes en español capitalizado', () => {
    expect(monthLabel(2026, 5)).toBe('Junio');
    expect(monthLabel(2026, 4)).toBe('Mayo');
    expect(monthLabel(2026, 0)).toBe('Enero');
  });
});

describe('cumulativeByDay', () => {
  it('acumula por día del mes rellenando huecos con 0 y es monótona', () => {
    const out = cumulativeByDay(
      [
        { day: '2026-06-01', revenue: 10 },
        { day: '2026-06-03', revenue: 5 },
      ],
      5,
    );
    expect(out).toEqual([10, 10, 15, 15, 15]);
    expect(out.every((v, i) => i === 0 || v >= (out[i - 1] ?? 0))).toBe(true);
  });

  it('corta la serie en `totalDays` (el mes en curso para en hoy)', () => {
    const out = cumulativeByDay([{ day: '2026-06-01', revenue: 100 }], 3);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1]).toBe(100);
  });
});

describe('buildReportMetrics (números del informe de referencia, 23-jun-2026)', () => {
  const now = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));
  const metrics = buildReportMetrics({
    now,
    current: { revenue: 63384, salesCount: 761, marginPct: 0.598 },
    previous: { revenue: 151654, salesCount: 1824, marginPct: 0.6 },
    dailyCurrent: [
      { day: '2026-06-01', revenue: 3000 },
      { day: '2026-06-23', revenue: 2000 },
    ],
    dailyPrevious: [{ day: '2026-05-31', revenue: 151654 }],
  });

  it('etiqueta y dimensiona los periodos (junio en curso vs mayo completo)', () => {
    expect(metrics.current.label).toBe('Junio');
    expect(metrics.current.daysElapsed).toBe(23);
    expect(metrics.current.daysInMonth).toBe(30);
    expect(metrics.previous.label).toBe('Mayo');
    expect(metrics.previous.daysInMonth).toBe(31);
  });

  it('calcula la media diaria comparable (€/día)', () => {
    // 63.384 / 23 ≈ 2.755,8 ; 151.654 / 31 ≈ 4.892,1
    expect(metrics.dailyAvg.revenue.current).toBeCloseTo(2755.83, 1);
    expect(metrics.dailyAvg.revenue.previous).toBeCloseTo(4892.06, 1);
  });

  it('proyecta a fin de mes (media diaria × días del mes)', () => {
    // 2.755,8 × 30 ≈ 82.674
    expect(metrics.dailyAvg.revenue.projection).toBeCloseTo(82674.78, 0);
  });

  it('calcula los tickets/día (33,1 vs 58,8)', () => {
    expect(metrics.dailyAvg.tickets.current).toBeCloseTo(33.09, 1);
    expect(metrics.dailyAvg.tickets.previous).toBeCloseTo(58.84, 1);
  });

  it('acumula la serie del mes en curso hasta hoy (longitud = días transcurridos)', () => {
    expect(metrics.cumulative.current).toHaveLength(23);
    expect(metrics.cumulative.current[22]).toBeCloseTo(5000, 5); // 3000 + 2000
    expect(metrics.cumulative.previous).toHaveLength(31);
    expect(metrics.cumulative.previous[30]).toBeCloseTo(151654, 5);
  });
});
