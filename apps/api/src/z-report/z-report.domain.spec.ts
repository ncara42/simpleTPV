import { describe, expect, it } from 'vitest';

import { buildZReport, type ZReportSale, type ZReportStore } from './z-report.domain.js';

const STORE: ZReportStore = { id: 'store-1', name: 'Tienda Centro', code: '01' };

// 3 ventas COMPLETED (CASH x2, CARD x1) + 1 VOIDED. La venta 3 lleva descuento de
// ticket (subtotal 231 → total 207.9). Cubre IVA al 21% y 10% y ambos métodos.
function sampleSales(): ZReportSale[] {
  return [
    {
      ticketNumber: 'T01-000001',
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      subtotal: 121,
      total: 121,
      discountTotal: 0,
      lines: [{ taxRate: 21, lineTotal: 121 }],
    },
    {
      ticketNumber: 'T01-000002',
      status: 'COMPLETED',
      paymentMethod: 'CARD',
      subtotal: 110,
      total: 110,
      discountTotal: 0,
      lines: [{ taxRate: 10, lineTotal: 110 }],
    },
    {
      ticketNumber: 'T01-000003',
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      subtotal: 231,
      total: 207.9,
      discountTotal: 23.1,
      lines: [
        { taxRate: 21, lineTotal: 121 },
        { taxRate: 10, lineTotal: 110 },
      ],
    },
    {
      ticketNumber: 'T01-000004',
      status: 'VOIDED',
      paymentMethod: 'CASH',
      subtotal: 121,
      total: 121,
      discountTotal: 0,
      lines: [{ taxRate: 21, lineTotal: 121 }],
    },
  ];
}

describe('buildZReport', () => {
  it('cuenta tickets COMPLETED y anuladas por separado', () => {
    const z = buildZReport(STORE, '2026-06-07', sampleSales());
    expect(z.ticketCount).toBe(3);
    expect(z.voidedCount).toBe(1);
    expect(z.store).toEqual(STORE);
    expect(z.date).toBe('2026-06-07');
  });

  it('calcula el rango de numeración emitido (incluye la anulada)', () => {
    const z = buildZReport(STORE, '2026-06-07', sampleSales());
    expect(z.firstTicketNumber).toBe('T01-000001');
    expect(z.lastTicketNumber).toBe('T01-000004');
  });

  it('suma subtotal, descuento y total solo de las COMPLETED', () => {
    const z = buildZReport(STORE, '2026-06-07', sampleSales());
    expect(z.subtotal).toBeCloseTo(462, 2);
    expect(z.discountTotal).toBeCloseTo(23.1, 2);
    expect(z.total).toBeCloseTo(438.9, 2);
  });

  it('desglosa el IVA por tipo y Σ(base+cuota) cuadra con el total', () => {
    const z = buildZReport(STORE, '2026-06-07', sampleSales());
    expect(z.taxBreakdown.map((t) => t.taxRate)).toEqual([10, 21]);

    const iva10 = z.taxBreakdown.find((t) => t.taxRate === 10)!;
    const iva21 = z.taxBreakdown.find((t) => t.taxRate === 21)!;
    // 10%: S2 (base 100, cuota 10) + S3 prorrateado (base 90, cuota 9).
    expect(iva10.base).toBeCloseTo(190, 2);
    expect(iva10.cuota).toBeCloseTo(19, 2);
    // 21%: S1 (base 100, cuota 21) + S3 prorrateado (base 90, cuota 18.9).
    expect(iva21.base).toBeCloseTo(190, 2);
    expect(iva21.cuota).toBeCloseTo(39.9, 2);

    const sumBaseCuota = z.taxBreakdown.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sumBaseCuota).toBeCloseTo(z.total, 2);
  });

  it('desglosa por método de pago y Σ cuadra con el total', () => {
    const z = buildZReport(STORE, '2026-06-07', sampleSales());
    expect(z.paymentBreakdown.map((p) => p.paymentMethod)).toEqual(['CARD', 'CASH']);

    const card = z.paymentBreakdown.find((p) => p.paymentMethod === 'CARD')!;
    const cash = z.paymentBreakdown.find((p) => p.paymentMethod === 'CASH')!;
    expect(card).toEqual({ paymentMethod: 'CARD', count: 1, total: 110 });
    expect(cash.count).toBe(2);
    expect(cash.total).toBeCloseTo(328.9, 2);

    const sum = z.paymentBreakdown.reduce((acc, p) => acc + p.total, 0);
    expect(sum).toBeCloseTo(z.total, 2);
  });

  it('día sin ventas: ceros y rango nulo', () => {
    const z = buildZReport(STORE, '2026-06-07', []);
    expect(z.ticketCount).toBe(0);
    expect(z.voidedCount).toBe(0);
    expect(z.firstTicketNumber).toBeNull();
    expect(z.lastTicketNumber).toBeNull();
    expect(z.total).toBe(0);
    expect(z.taxBreakdown).toEqual([]);
    expect(z.paymentBreakdown).toEqual([]);
  });

  it('refleja huecos de numeración (bloques offline) sin contarlos como tickets', () => {
    // Nº 1 y 4 usados; 2 y 3 quedaron reservados sin usar (bloque offline).
    const sales: ZReportSale[] = [
      {
        ticketNumber: 'T01-000001',
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        subtotal: 10,
        total: 10,
        discountTotal: 0,
        lines: [{ taxRate: 21, lineTotal: 10 }],
      },
      {
        ticketNumber: 'T01-000004',
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        subtotal: 10,
        total: 10,
        discountTotal: 0,
        lines: [{ taxRate: 21, lineTotal: 10 }],
      },
    ];
    const z = buildZReport(STORE, '2026-06-07', sales);
    expect(z.ticketCount).toBe(2);
    expect(z.firstTicketNumber).toBe('T01-000001');
    expect(z.lastTicketNumber).toBe('T01-000004');
    // (último − primero + 1) = 4 > ticketCount 2 → hay 2 huecos justificados.
  });
});
