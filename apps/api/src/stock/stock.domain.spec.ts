import { describe, expect, it } from 'vitest';

import {
  alertTypeFor,
  allocateFefo,
  daysUntil,
  expiryCutoff,
  expiryStatus,
  stockLevel,
} from './stock.domain.js';

describe('stockLevel', () => {
  it('red sin stock, yellow en/bajo mínimo, green por encima', () => {
    expect(stockLevel(0, 5)).toBe('red');
    expect(stockLevel(-1, 5)).toBe('red');
    expect(stockLevel(5, 5)).toBe('yellow');
    expect(stockLevel(6, 5)).toBe('green');
  });
});

describe('alertTypeFor', () => {
  it('OUT_OF_STOCK <=0, LOW_STOCK en/bajo mínimo, null por encima', () => {
    expect(alertTypeFor(0, 5)).toBe('OUT_OF_STOCK');
    expect(alertTypeFor(3, 5)).toBe('LOW_STOCK');
    expect(alertTypeFor(6, 5)).toBeNull();
  });
});

describe('allocateFefo', () => {
  it('un lote que cubre toda la cantidad: lo consume, sin faltante', () => {
    const r = allocateFefo([{ lotCode: 'A', quantity: 10 }], 4);
    expect(r.consumed).toEqual([{ lotCode: 'A', qty: 4 }]);
    expect(r.shortfall).toBe(0);
  });

  it('consume en orden FEFO: agota el primero y parte del segundo', () => {
    const r = allocateFefo(
      [
        { lotCode: 'A', quantity: 3 },
        { lotCode: 'B', quantity: 10 },
      ],
      5,
    );
    expect(r.consumed).toEqual([
      { lotCode: 'A', qty: 3 },
      { lotCode: 'B', qty: 2 },
    ]);
    expect(r.shortfall).toBe(0);
  });

  it('faltante: vender más de lo recibido deja shortfall', () => {
    const r = allocateFefo(
      [
        { lotCode: 'A', quantity: 2 },
        { lotCode: 'B', quantity: 1 },
      ],
      5,
    );
    expect(r.consumed).toEqual([
      { lotCode: 'A', qty: 2 },
      { lotCode: 'B', qty: 1 },
    ]);
    expect(r.shortfall).toBe(2);
  });

  it('sin lotes: todo es faltante', () => {
    const r = allocateFefo([], 3);
    expect(r.consumed).toEqual([]);
    expect(r.shortfall).toBe(3);
  });

  it('salta lotes con cantidad 0', () => {
    const r = allocateFefo(
      [
        { lotCode: 'A', quantity: 0 },
        { lotCode: 'B', quantity: 5 },
      ],
      2,
    );
    expect(r.consumed).toEqual([{ lotCode: 'B', qty: 2 }]);
    expect(r.shortfall).toBe(0);
  });

  it('cantidades decimales: redondea a 3 decimales sin descuadre', () => {
    const r = allocateFefo(
      [
        { lotCode: 'A', quantity: 1.5 },
        { lotCode: 'B', quantity: 2 },
      ],
      2.25,
    );
    expect(r.consumed).toEqual([
      { lotCode: 'A', qty: 1.5 },
      { lotCode: 'B', qty: 0.75 },
    ]);
    expect(r.shortfall).toBe(0);
  });
});

describe('daysUntil', () => {
  const today = new Date('2026-06-08T00:00:00.000Z');

  it('positivo en el futuro, 0 hoy, negativo en el pasado', () => {
    expect(daysUntil(new Date('2026-06-18'), today)).toBe(10);
    expect(daysUntil(new Date('2026-06-08'), today)).toBe(0);
    expect(daysUntil(new Date('2026-06-01'), today)).toBe(-7);
  });

  it('ignora la hora del día (trunca a día UTC)', () => {
    // Hoy a las 23:59 sigue siendo "0 días" hasta una caducidad de hoy 00:00.
    const lateToday = new Date('2026-06-08T23:59:59.000Z');
    expect(daysUntil(new Date('2026-06-08'), lateToday)).toBe(0);
    expect(daysUntil(new Date('2026-06-09'), lateToday)).toBe(1);
  });
});

describe('expiryStatus', () => {
  const today = new Date('2026-06-08T00:00:00.000Z');

  it('expired si la fecha quedó atrás', () => {
    expect(expiryStatus(new Date('2026-06-07'), today, 30)).toBe('expired');
  });

  it('expiring hoy y dentro de la ventana (límite inclusivo)', () => {
    expect(expiryStatus(new Date('2026-06-08'), today, 30)).toBe('expiring'); // hoy
    expect(expiryStatus(new Date('2026-06-18'), today, 30)).toBe('expiring'); // +10
    expect(expiryStatus(new Date('2026-07-08'), today, 30)).toBe('expiring'); // +30 exacto
  });

  it('ok más allá de la ventana', () => {
    expect(expiryStatus(new Date('2026-07-09'), today, 30)).toBe('ok'); // +31
  });
});

describe('expiryCutoff', () => {
  it('devuelve hoy + withinDays a medianoche UTC', () => {
    const today = new Date('2026-06-08T15:30:00.000Z');
    expect(expiryCutoff(today, 30).toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(expiryCutoff(today, 0).toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});
