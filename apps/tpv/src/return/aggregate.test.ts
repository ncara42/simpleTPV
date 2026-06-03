import type { Return } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import { returnedBySaleLine } from './aggregate.js';

function ret(lines: { saleLineId: string; qty: number }[]): Return {
  return { lines } as unknown as Return;
}

describe('returnedBySaleLine', () => {
  it('suma las cantidades devueltas por línea de venta', () => {
    const map = returnedBySaleLine([
      ret([
        { saleLineId: 'l1', qty: 1 },
        { saleLineId: 'l2', qty: 2 },
      ]),
      ret([{ saleLineId: 'l1', qty: 3 }]),
    ]);
    expect(map.get('l1')).toBe(4);
    expect(map.get('l2')).toBe(2);
  });

  it('devuelve un mapa vacío sin devoluciones', () => {
    expect(returnedBySaleLine([]).size).toBe(0);
  });
});
