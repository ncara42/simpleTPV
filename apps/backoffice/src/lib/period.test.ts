import { describe, expect, it } from 'vitest';

import { isDashboardPeriod, parsePeriod, PERIOD_OPTIONS, periodToRange } from './period.js';

describe('period — metadatos', () => {
  it('expone los 5 periodos del Dashboard en orden (Hoy→Año)', () => {
    expect(PERIOD_OPTIONS.map((o) => o.value)).toEqual([
      'today',
      'yesterday',
      'week',
      'month',
      'year',
    ]);
    expect(PERIOD_OPTIONS.map((o) => o.label)).toEqual(['Hoy', 'Ayer', 'Semana', 'Mes', 'Año']);
  });
});

describe('isDashboardPeriod', () => {
  it('acepta los valores válidos', () => {
    for (const p of ['today', 'yesterday', 'week', 'month', 'year']) {
      expect(isDashboardPeriod(p)).toBe(true);
    }
  });

  it('rechaza valores inválidos, vacíos o nulos', () => {
    expect(isDashboardPeriod('custom')).toBe(false);
    expect(isDashboardPeriod('')).toBe(false);
    expect(isDashboardPeriod(null)).toBe(false);
    expect(isDashboardPeriod(undefined)).toBe(false);
  });
});

describe('parsePeriod', () => {
  it('devuelve el valor cuando es válido', () => {
    expect(parsePeriod('month', 'today')).toBe('month');
  });

  it('cae al fallback cuando falta o es inválido', () => {
    expect(parsePeriod(null, 'today')).toBe('today');
    expect(parsePeriod('xxx', 'week')).toBe('week');
  });
});

describe('periodToRange', () => {
  // Fecha fija: jueves 18 de junio de 2026 (getDay()===4) para asserts deterministas.
  const NOW = new Date(2026, 5, 18, 13, 30);

  it('today → date del día actual (un solo día)', () => {
    expect(periodToRange('today', NOW)).toEqual({ date: '2026-06-18' });
  });

  it('yesterday → date del día anterior', () => {
    expect(periodToRange('yesterday', NOW)).toEqual({ date: '2026-06-17' });
  });

  it('week → desde el lunes ISO de la semana en curso hasta hoy', () => {
    // Jueves 18 → lunes de esa semana = 15 de junio.
    expect(periodToRange('week', NOW)).toEqual({ from: '2026-06-15', to: '2026-06-18' });
  });

  it('month → desde el día 1 del mes natural hasta hoy', () => {
    expect(periodToRange('month', NOW)).toEqual({ from: '2026-06-01', to: '2026-06-18' });
  });

  it('year → desde el 1 de enero del año natural hasta hoy', () => {
    expect(periodToRange('year', NOW)).toEqual({ from: '2026-01-01', to: '2026-06-18' });
  });

  it('yesterday cruza el cambio de mes correctamente', () => {
    const firstOfMonth = new Date(2026, 6, 1, 9); // 1 de julio
    expect(periodToRange('yesterday', firstOfMonth)).toEqual({ date: '2026-06-30' });
  });

  it('week con domingo toma el lunes anterior (semana ISO, lunes primero)', () => {
    const sunday = new Date(2026, 5, 21, 10); // domingo 21 de junio
    expect(periodToRange('week', sunday)).toEqual({ from: '2026-06-15', to: '2026-06-21' });
  });
});
