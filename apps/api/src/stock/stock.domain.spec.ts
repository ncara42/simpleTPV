import { describe, expect, it } from 'vitest';

import {
  alertTypeFor,
  allocateFefo,
  allocateReturnToBatches,
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

  it('corta en cuanto cubre la cantidad: no recorre lotes posteriores', () => {
    // El primer lote satisface la salida → el bucle sale (break) sin tocar B.
    const r = allocateFefo(
      [
        { lotCode: 'A', quantity: 10 },
        { lotCode: 'B', quantity: 5 },
      ],
      4,
    );
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

describe('allocateReturnToBatches', () => {
  it('devolución total: revierte exactamente el consumo de la venta', () => {
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 3 },
        { batchId: 'B', qty: 2 },
      ],
      {},
      5,
    );
    expect(r.perBatch).toEqual([
      { batchId: 'A', qty: 3 },
      { batchId: 'B', qty: 2 },
    ]);
    expect(r.noLot).toBe(0);
  });

  it('corta en cuanto reingresa lo devuelto: no recorre lotes posteriores', () => {
    // Se reingresa todo en el primer lote → el bucle sale (break) sin tocar B.
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 3 },
        { batchId: 'B', qty: 2 },
      ],
      {},
      3,
    );
    expect(r.perBatch).toEqual([{ batchId: 'A', qty: 3 }]);
    expect(r.noLot).toBe(0);
  });

  it('devolución parcial: reingresa por orden de consumo (espejo FEFO)', () => {
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 3 },
        { batchId: 'B', qty: 10 },
      ],
      {},
      4,
    );
    // Llena A (3) y el resto al siguiente (1), sin tocar el resto de B.
    expect(r.perBatch).toEqual([
      { batchId: 'A', qty: 3 },
      { batchId: 'B', qty: 1 },
    ]);
    expect(r.noLot).toBe(0);
  });

  it('capa por lote descontando lo ya reingresado (parciales encadenadas, D3)', () => {
    // De A salieron 3 pero ya se devolvieron 3 (capacidad 0) → salta A; va a B.
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 3 },
        { batchId: 'B', qty: 5 },
      ],
      { A: 3, B: 1 },
      2,
    );
    expect(r.perBatch).toEqual([{ batchId: 'B', qty: 2 }]);
    expect(r.noLot).toBe(0);
  });

  it('faltante: lo que excede la capacidad de los lotes cae en noLot (sin lote)', () => {
    // La venta tuvo faltante (se vendió más de lo que cubrían los lotes): solo 2+1
    // salieron con lote; devolver 5 reingresa 3 a lotes y 2 sin lote.
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 2 },
        { batchId: 'B', qty: 1 },
      ],
      {},
      5,
    );
    expect(r.perBatch).toEqual([
      { batchId: 'A', qty: 2 },
      { batchId: 'B', qty: 1 },
    ]);
    expect(r.noLot).toBe(2);
  });

  it('sin lotes consumidos (venta sin lote): todo es noLot', () => {
    const r = allocateReturnToBatches([], {}, 3);
    expect(r.perBatch).toEqual([]);
    expect(r.noLot).toBe(3);
  });

  it('cantidades decimales: redondea a 3 decimales sin descuadre', () => {
    const r = allocateReturnToBatches(
      [
        { batchId: 'A', qty: 1.5 },
        { batchId: 'B', qty: 2 },
      ],
      { A: 0.25 },
      2,
    );
    // Capacidad de A = 1.5 - 0.25 = 1.25; resto 0.75 a B.
    expect(r.perBatch).toEqual([
      { batchId: 'A', qty: 1.25 },
      { batchId: 'B', qty: 0.75 },
    ]);
    expect(r.noLot).toBe(0);
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
