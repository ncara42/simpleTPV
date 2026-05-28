import { describe, expect, it } from 'vitest';

import { computeChange, computeTotals, formatTicket } from './sales.service.js';

describe('formatTicket', () => {
  it('formatea code + contador con padding a 6', () => {
    expect(formatTicket('01', 1)).toBe('T01-000001');
    expect(formatTicket('02', 123456)).toBe('T02-123456');
  });
});

describe('computeTotals', () => {
  it('calcula lineTotal, subtotal y total con cantidades decimales', () => {
    const result = computeTotals([
      { productId: 'p1', name: 'A', unitPrice: 12.5, qty: 2 },
      { productId: 'p2', name: 'B', unitPrice: 3.333, qty: 1.5 },
    ]);
    expect(result.lines[0]!.lineTotal).toBeCloseTo(25, 2);
    expect(result.lines[1]!.lineTotal).toBeCloseTo(5, 2);
    expect(result.subtotal).toBeCloseTo(30, 2);
    expect(result.total).toBeCloseTo(30, 2);
  });
});

describe('computeChange', () => {
  it('CARD: cashGiven y cashChange quedan null', () => {
    expect(computeChange('CARD', 30, undefined)).toEqual({ cashGiven: null, cashChange: null });
    // Aunque llegue cashGiven con tarjeta, se ignora.
    expect(computeChange('CARD', 30, 50)).toEqual({ cashGiven: null, cashChange: null });
  });

  it('CASH sin cashGiven: ambos null (pago justo no detallado)', () => {
    expect(computeChange('CASH', 30, undefined)).toEqual({ cashGiven: null, cashChange: null });
  });

  it('CASH con cashGiven >= total: calcula el cambio', () => {
    expect(computeChange('CASH', 30, 50)).toEqual({ cashGiven: 50, cashChange: 20 });
    expect(computeChange('CASH', 30, 30)).toEqual({ cashGiven: 30, cashChange: 0 });
  });

  it('CASH con cambio decimal redondea a 2 decimales', () => {
    const r = computeChange('CASH', 12.34, 20);
    expect(r.cashChange).toBeCloseTo(7.66, 2);
  });

  it('CASH con cashGiven < total lanza error de efectivo insuficiente', () => {
    expect(() => computeChange('CASH', 30, 20)).toThrow('Efectivo insuficiente');
  });
});
