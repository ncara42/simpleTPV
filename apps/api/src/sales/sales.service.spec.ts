import { describe, expect, it } from 'vitest';

import {
  assertDiscountWithinRoleLimit,
  buildTaxBreakdown,
  computeChange,
  computeTotals,
  formatTicket,
} from './sales.service.js';

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
    expect(result.discountTotal).toBeCloseTo(0, 2);
    expect(result.lines[0]!.gross).toBeCloseTo(25, 2);
    expect(result.lines[0]!.discountAmt).toBeCloseTo(0, 2);
  });

  it('aplica descuento por línea (gross/discountAmt/lineTotal neto)', () => {
    const result = computeTotals([
      { productId: 'p1', name: 'A', unitPrice: 10, qty: 2, discountPct: 10 },
    ]);
    expect(result.lines[0]!.gross).toBeCloseTo(20, 2);
    expect(result.lines[0]!.discountAmt).toBeCloseTo(2, 2);
    expect(result.lines[0]!.lineTotal).toBeCloseTo(18, 2);
    expect(result.subtotal).toBeCloseTo(18, 2);
    expect(result.discountTotal).toBeCloseTo(2, 2);
    expect(result.total).toBeCloseTo(18, 2);
  });

  it('aplica descuento de ticket por porcentaje sobre el subtotal neto', () => {
    const result = computeTotals([{ productId: 'p1', name: 'A', unitPrice: 100, qty: 1 }], {
      ticketDiscountPct: 25,
    });
    expect(result.subtotal).toBeCloseTo(100, 2);
    expect(result.ticketDiscount).toBeCloseTo(25, 2);
    expect(result.discountTotal).toBeCloseTo(25, 2);
    expect(result.total).toBeCloseTo(75, 2);
  });

  it('aplica descuento de ticket por importe fijo', () => {
    const result = computeTotals([{ productId: 'p1', name: 'A', unitPrice: 100, qty: 1 }], {
      ticketDiscountAmt: 30,
    });
    expect(result.ticketDiscount).toBeCloseTo(30, 2);
    expect(result.total).toBeCloseTo(70, 2);
  });

  it('capa el importe de ticket al subtotal (no negativos)', () => {
    const result = computeTotals([{ productId: 'p1', name: 'A', unitPrice: 50, qty: 1 }], {
      ticketDiscountAmt: 999,
    });
    expect(result.ticketDiscount).toBeCloseTo(50, 2);
    expect(result.total).toBeCloseTo(0, 2);
  });

  it('si vienen pct y amt de ticket, el importe tiene precedencia', () => {
    const result = computeTotals([{ productId: 'p1', name: 'A', unitPrice: 100, qty: 1 }], {
      ticketDiscountPct: 50,
      ticketDiscountAmt: 10,
    });
    expect(result.ticketDiscount).toBeCloseTo(10, 2);
    expect(result.total).toBeCloseTo(90, 2);
  });

  it('combina descuento de línea y de ticket', () => {
    const result = computeTotals(
      [
        { productId: 'p1', name: 'A', unitPrice: 100, qty: 1, discountPct: 10 },
        { productId: 'p2', name: 'B', unitPrice: 50, qty: 2 },
      ],
      { ticketDiscountPct: 10 },
    );
    // línea1: gross 100, disc 10, neto 90. línea2: 100. subtotal 190.
    expect(result.subtotal).toBeCloseTo(190, 2);
    // ticket 10% de 190 = 19. discountTotal = 10 (línea) + 19 (ticket) = 29.
    expect(result.ticketDiscount).toBeCloseTo(19, 2);
    expect(result.discountTotal).toBeCloseTo(29, 2);
    expect(result.total).toBeCloseTo(171, 2);
  });
});

describe('assertDiscountWithinRoleLimit', () => {
  // grossTotal de 100; discountTotal sobre ese gross.
  it('ADMIN: sin límite (80% pasa)', () => {
    expect(() => assertDiscountWithinRoleLimit('ADMIN', 80, 100)).not.toThrow();
  });

  it('MANAGER: 11% pasa (límite 50%)', () => {
    expect(() => assertDiscountWithinRoleLimit('MANAGER', 11, 100)).not.toThrow();
  });

  it('CLERK: 10% justo pasa', () => {
    expect(() => assertDiscountWithinRoleLimit('CLERK', 10, 100)).not.toThrow();
  });

  it('CLERK: 11% supera el límite y lanza 403', () => {
    expect(() => assertDiscountWithinRoleLimit('CLERK', 11, 100)).toThrow(/límite del rol CLERK/);
  });

  it('grossTotal 0 no divide por cero ni lanza', () => {
    expect(() => assertDiscountWithinRoleLimit('CLERK', 0, 0)).not.toThrow();
  });
});

describe('buildTaxBreakdown', () => {
  it('un tipo de IVA: base + cuota = neto', () => {
    // Precio IVA incluido: 121 al 21% → base 100, cuota 21.
    const r = buildTaxBreakdown([{ taxRate: 21, lineTotal: 121 }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.taxRate).toBe(21);
    expect(r[0]!.base).toBeCloseTo(100, 2);
    expect(r[0]!.cuota).toBeCloseTo(21, 2);
    expect(r[0]!.base + r[0]!.cuota).toBeCloseTo(121, 2);
  });

  it('agrupa por tipo y suma los netos del grupo', () => {
    const r = buildTaxBreakdown([
      { taxRate: 21, lineTotal: 121 },
      { taxRate: 21, lineTotal: 60.5 },
      { taxRate: 10, lineTotal: 110 },
    ]);
    expect(r).toHaveLength(2);
    // Orden ascendente por taxRate.
    expect(r[0]!.taxRate).toBe(10);
    expect(r[1]!.taxRate).toBe(21);
    // Grupo 10%: neto 110 → base 100, cuota 10.
    expect(r[0]!.base).toBeCloseTo(100, 2);
    expect(r[0]!.cuota).toBeCloseTo(10, 2);
    // Grupo 21%: neto 181.5 → base 150, cuota 31.5.
    expect(r[1]!.base).toBeCloseTo(150, 2);
    expect(r[1]!.cuota).toBeCloseTo(31.5, 2);
  });

  it('IVA 0% deja toda la base sin cuota', () => {
    const r = buildTaxBreakdown([{ taxRate: 0, lineTotal: 50 }]);
    expect(r[0]!.base).toBeCloseTo(50, 2);
    expect(r[0]!.cuota).toBeCloseTo(0, 2);
  });

  it('sin descuento de ticket: Σ(base+cuota) = subtotal = total', () => {
    const lines = [
      { taxRate: 21, lineTotal: 121 },
      { taxRate: 10, lineTotal: 110 },
    ];
    const r = buildTaxBreakdown(lines, 0);
    const sum = r.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sum).toBeCloseTo(231, 2);
  });

  it('con descuento de ticket: prorratea y Σ(base+cuota) = total', () => {
    // Subtotal 231 (121 al 21% + 110 al 10%). Descuento de ticket 23.1 (10%).
    // total = 207.9. El desglose debe sumar 207.9, no 231.
    const lines = [
      { taxRate: 21, lineTotal: 121 },
      { taxRate: 10, lineTotal: 110 },
    ];
    const ticketDiscount = 23.1;
    const r = buildTaxBreakdown(lines, ticketDiscount);
    const sum = r.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sum).toBeCloseTo(231 - ticketDiscount, 2);
    // Cada grupo mantiene su proporción: el neto ajustado conserva el reparto.
    // Grupo 21%: neto 121 → prorrateo 121*23.1/231 = 12.1 → netoAjustado 108.9.
    // Grupo 10%: neto 110 → prorrateo 11 → netoAjustado 99.
    const g21 = r.find((t) => t.taxRate === 21)!;
    const g10 = r.find((t) => t.taxRate === 10)!;
    expect(g21.base + g21.cuota).toBeCloseTo(108.9, 2);
    expect(g10.base + g10.cuota).toBeCloseTo(99, 2);
    // Y dentro de cada grupo base/cuota siguen el tipo.
    expect(g21.base).toBeCloseTo(90, 2);
    expect(g21.cuota).toBeCloseTo(18.9, 2);
    expect(g10.base).toBeCloseTo(90, 2);
    expect(g10.cuota).toBeCloseTo(9, 2);
  });

  it('descuento de ticket con redondeo: Σ cuadra al céntimo ajustando el último grupo', () => {
    // Netos que provocan prorrateos no exactos; el ajuste del último grupo evita
    // descuadres de 1 céntimo.
    const lines = [
      { taxRate: 21, lineTotal: 33.33 },
      { taxRate: 10, lineTotal: 33.33 },
      { taxRate: 4, lineTotal: 33.34 },
    ];
    const subtotal = 100;
    const ticketDiscount = 7.77;
    const r = buildTaxBreakdown(lines, ticketDiscount);
    const sum = r.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sum).toBeCloseTo(subtotal - ticketDiscount, 2);
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
