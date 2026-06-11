import { describe, expect, it } from 'vitest';

import {
  deltaTone,
  fmtDelta,
  fmtEur,
  fmtHours,
  fmtNum,
  fmtRate,
  invertTone,
  seriesTrend,
} from './format.js';

// Todos los formatters comparten la misma convención: null/undefined/NaN → "—".
// Se cubre ese contrato en cada uno además de su formato propio.
const NULLISH = [null, undefined, Number.NaN] as const;

describe('fmtEur', () => {
  it('devuelve "—" para valores no finitos', () => {
    for (const v of NULLISH) {
      expect(fmtEur(v)).toBe('—');
    }
  });

  it('formatea en euros con coma decimal y símbolo €', () => {
    // El espaciado/agrupación exactos dependen de la versión de ICU, así que se
    // comprueban las invariantes estables: decimal con coma y símbolo €.
    const out = fmtEur(1234.5);
    expect(out).toContain('€');
    expect(out).toContain(',50');
    expect(fmtEur(0)).toContain('0,00');
  });
});

describe('fmtRate', () => {
  it('devuelve "—" para valores no finitos', () => {
    for (const v of NULLISH) {
      expect(fmtRate(v)).toBe('—');
    }
  });

  it('convierte proporción 0–1 a porcentaje con 1 decimal', () => {
    expect(fmtRate(0.123)).toBe('12.3 %');
    expect(fmtRate(1)).toBe('100.0 %');
    expect(fmtRate(0)).toBe('0.0 %');
  });
});

describe('fmtDelta', () => {
  it('devuelve "—" para valores no finitos', () => {
    for (const v of NULLISH) {
      expect(fmtDelta(v)).toBe('—');
    }
  });

  it('añade signo + solo a los positivos', () => {
    expect(fmtDelta(145)).toBe('+145.0 %');
    expect(fmtDelta(-10)).toBe('-10.0 %');
    expect(fmtDelta(0)).toBe('0.0 %');
  });
});

describe('deltaTone', () => {
  it('mapea el signo a tono semántico; cero/nulo → flat', () => {
    expect(deltaTone(5)).toBe('up');
    expect(deltaTone(-1)).toBe('down');
    expect(deltaTone(0)).toBe('flat');
    for (const v of NULLISH) {
      expect(deltaTone(v)).toBe('flat');
    }
  });
});

describe('fmtNum', () => {
  it('devuelve "—" para valores no finitos', () => {
    for (const v of NULLISH) {
      expect(fmtNum(v)).toBe('—');
    }
  });

  it('respeta los decimales indicados (2 por defecto)', () => {
    expect(fmtNum(1.5)).toBe('1.50');
    expect(fmtNum(1.5, 0)).toBe('2');
    expect(fmtNum(3, 1)).toBe('3.0');
  });
});

describe('fmtHours', () => {
  it('devuelve "—" para valores no finitos', () => {
    for (const v of NULLISH) {
      expect(fmtHours(v)).toBe('—');
    }
  });

  it('formatea horas con coma decimal y sufijo h', () => {
    expect(fmtHours(1.5)).toBe('1,5 h');
    expect(fmtHours(0)).toBe('0,0 h');
  });
});

describe('seriesTrend', () => {
  it('compara el último punto con el primero', () => {
    expect(seriesTrend([1, 2, 3])).toBe('up');
    expect(seriesTrend([3, 2, 1])).toBe('down');
    expect(seriesTrend([2, 5, 2])).toBe('flat');
  });

  it('es plano sin serie o con menos de dos puntos', () => {
    expect(seriesTrend(undefined)).toBe('flat');
    expect(seriesTrend([])).toBe('flat');
    expect(seriesTrend([7])).toBe('flat');
  });
});

describe('invertTone', () => {
  it('intercambia subir y bajar, deja plano igual', () => {
    expect(invertTone('up')).toBe('down');
    expect(invertTone('down')).toBe('up');
    expect(invertTone('flat')).toBe('flat');
  });
});
