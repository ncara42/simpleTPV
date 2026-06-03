import { describe, expect, it } from 'vitest';

import { stockLevel } from './stock.js';

describe('stockLevel', () => {
  it('red cuando no hay stock (quantity <= 0)', () => {
    expect(stockLevel(0, 5)).toBe('red');
    expect(stockLevel(-3, 5)).toBe('red');
  });

  it('yellow cuando está en o por debajo del mínimo', () => {
    expect(stockLevel(5, 5)).toBe('yellow');
    expect(stockLevel(2, 5)).toBe('yellow');
  });

  it('green cuando supera el mínimo', () => {
    expect(stockLevel(6, 5)).toBe('green');
  });

  it('con minStock 0 solo hay red (<=0) o green (>0)', () => {
    expect(stockLevel(0, 0)).toBe('red');
    expect(stockLevel(1, 0)).toBe('green');
  });
});
