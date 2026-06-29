import { describe, expect, it } from 'vitest';

import { historyWindow, maxBackOffset, windowUnit } from './kpi-history.js';

describe('windowUnit — granularidad de la ventana según el periodo', () => {
  it('today/yesterday → día', () => {
    expect(windowUnit('today')).toBe('day');
    expect(windowUnit('yesterday')).toBe('day');
  });
  it('week → semana, month → mes, year → año', () => {
    expect(windowUnit('week')).toBe('week');
    expect(windowUnit('month')).toBe('month');
    expect(windowUnit('year')).toBe('year');
  });
});

describe('maxBackOffset — tope ≈ 12 meses de historial', () => {
  it('escala con la unidad', () => {
    expect(maxBackOffset('today')).toBe(365);
    expect(maxBackOffset('week')).toBe(52);
    expect(maxBackOffset('month')).toBe(12);
    expect(maxBackOffset('year')).toBe(4);
  });
});

describe('historyWindow', () => {
  // Jueves 18 de junio de 2026 (getDay()===4) para asserts deterministas.
  const NOW = new Date(2026, 5, 18, 13, 30);

  it('today, 1 atrás → el día anterior (rango de un solo día)', () => {
    expect(historyWindow('today', 1, NOW)).toEqual({
      from: '2026-06-17',
      to: '2026-06-17',
      label: '17 jun',
    });
  });

  it('today, 3 atrás → tres días antes', () => {
    expect(historyWindow('today', 3, NOW)).toEqual({
      from: '2026-06-15',
      to: '2026-06-15',
      label: '15 jun',
    });
  });

  it('yesterday, 1 atrás → el día anterior a ayer (base = ayer)', () => {
    expect(historyWindow('yesterday', 1, NOW)).toEqual({
      from: '2026-06-16',
      to: '2026-06-16',
      label: '16 jun',
    });
  });

  it('day cruza el cambio de mes y de año en la etiqueta', () => {
    const jan2 = new Date(2026, 0, 2, 9); // 2 de enero de 2026
    expect(historyWindow('today', 3, jan2)).toEqual({
      from: '2025-12-30',
      to: '2025-12-30',
      label: '30 dic 25',
    });
  });

  it('week, 1 atrás → semana ISO completa anterior (lunes→domingo)', () => {
    // Semana en curso = 15–21 jun; la anterior = 8–14 jun.
    expect(historyWindow('week', 1, NOW)).toEqual({
      from: '2026-06-08',
      to: '2026-06-14',
      label: '8–14 jun',
    });
  });

  it('week dentro del mismo mes usa la etiqueta compacta', () => {
    // 3 atrás desde la semana en curso (15–21 jun) = 25–31 may, todo en mayo.
    expect(historyWindow('week', 3, NOW)).toEqual({
      from: '2026-05-25',
      to: '2026-05-31',
      label: '25–31 may',
    });
  });

  it('week a caballo entre dos meses muestra ambos meses', () => {
    // 7 atrás = lunes 27 abr → domingo 3 may.
    expect(historyWindow('week', 7, NOW)).toEqual({
      from: '2026-04-27',
      to: '2026-05-03',
      label: '27 abr – 3 may',
    });
  });

  it('month, 1 atrás → mes natural completo anterior', () => {
    expect(historyWindow('month', 1, NOW)).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
      label: 'may',
    });
  });

  it('month cruza el cambio de año y muestra el año en la etiqueta', () => {
    // 6 atrás desde junio 2026 = diciembre 2025.
    expect(historyWindow('month', 6, NOW)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
      label: 'dic 25',
    });
  });

  it('year, 1 atrás → año natural completo anterior', () => {
    expect(historyWindow('year', 1, NOW)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
      label: '2025',
    });
  });
});
