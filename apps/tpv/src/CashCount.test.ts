import { describe, expect, it } from 'vitest';

import { countedTotal } from './CashCount.js';

describe('countedTotal', () => {
  it('sin piezas → 0', () => {
    expect(countedTotal({})).toBe(0);
  });

  it('suma billetes y monedas por denominación', () => {
    // 1×50€ + 2×20€ + 1×5€ + 3×1€ = 50 + 40 + 5 + 3 = 98
    expect(countedTotal({ '5000': 1, '2000': 2, '500': 1, '100': 3 })).toBe(98);
  });

  it('céntimos sin errores de coma flotante', () => {
    // 1×10cts + 1×5cts + 2×2cts = 0.10 + 0.05 + 0.04 = 0.19 exacto
    expect(countedTotal({ '10': 1, '5': 1, '2': 2 })).toBe(0.19);
  });

  it('ignora claves que no son denominaciones', () => {
    expect(countedTotal({ '99999': 5, '50000': 1 })).toBe(500);
  });
});
