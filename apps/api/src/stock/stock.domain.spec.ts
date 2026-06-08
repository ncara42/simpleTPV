import { describe, expect, it } from 'vitest';

import { alertTypeFor, allocateFefo, stockLevel } from './stock.domain.js';

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
