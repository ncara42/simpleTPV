import { describe, expect, it } from 'vitest';

import { computeTotals, formatTicket } from './sales.service.js';

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
