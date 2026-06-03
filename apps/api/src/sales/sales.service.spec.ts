import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { MemoryCache } from '../cache/memory-cache.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { tenantStorage } from '../prisma/tenant-context.js';
import { StockService } from '../stock/stock.service.js';
import {
  assertDiscountWithinRoleLimit,
  buildTaxBreakdown,
  computeChange,
  computeTotals,
  dayRange,
  formatTicket,
  SalesService,
} from './sales.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('formatTicket', () => {
  it('formatea code + contador con padding a 6', () => {
    expect(formatTicket('01', 1)).toBe('T01-000001');
    expect(formatTicket('02', 123456)).toBe('T02-123456');
  });
});

describe('dayRange', () => {
  it('devuelve el rango UTC semiabierto [00:00 del día, 00:00 del día siguiente)', () => {
    const { gte, lt } = dayRange('2026-05-28');
    expect(gte.toISOString()).toBe('2026-05-28T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('cruza el límite de mes correctamente', () => {
    const { gte, lt } = dayRange('2026-01-31');
    expect(gte.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('el rango cubre exactamente 24 horas', () => {
    const { gte, lt } = dayRange('2026-12-25');
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
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

  it('aplica descuento por línea por importe fijo (€) con precedencia sobre el %', () => {
    const result = computeTotals([
      // Si llegan ambos, el importe fijo manda (igual que el descuento de ticket).
      { productId: 'p1', name: 'A', unitPrice: 10, qty: 2, discountPct: 50, discountAmt: 5 },
    ]);
    expect(result.lines[0]!.gross).toBeCloseTo(20, 2);
    expect(result.lines[0]!.discountAmt).toBeCloseTo(5, 2);
    expect(result.lines[0]!.lineTotal).toBeCloseTo(15, 2);
    expect(result.subtotal).toBeCloseTo(15, 2);
    expect(result.discountTotal).toBeCloseTo(5, 2);
  });

  it('capa el importe fijo de línea al bruto (no negativos)', () => {
    const result = computeTotals([
      { productId: 'p1', name: 'A', unitPrice: 10, qty: 1, discountAmt: 999 },
    ]);
    expect(result.lines[0]!.discountAmt).toBeCloseTo(10, 2);
    expect(result.lines[0]!.lineTotal).toBeCloseTo(0, 2);
    expect(result.total).toBeCloseTo(0, 2);
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

  it('sin líneas o con subtotal 0 devuelve un desglose vacío', () => {
    expect(buildTaxBreakdown([])).toEqual([]);
    expect(buildTaxBreakdown([{ taxRate: 21, lineTotal: 0 }])).toEqual([]);
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

// Mock mínimo del cliente Prisma extendido (el que usa SalesService para
// lecturas y para voidSale). Solo declaramos los modelos/operaciones que
// tocan los métodos bajo test.
function makePrisma() {
  return {
    sale: {
      // voidSale ahora carga la venta con include:{lines}. Por defecto sin líneas
      // (los tests que prueban la reposición las añaden en su findFirst).
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => null),
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
      count: vi.fn(async (_a?: unknown): Promise<number> => 0),
      aggregate: vi.fn(
        async (_a?: unknown): Promise<{ _sum: { total: unknown }; _count: number }> => ({
          _sum: { total: null },
          _count: 0,
        }),
      ),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'sale-1' })),
    },
    product: {
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
    },
    return: {
      count: vi.fn(async (_a?: unknown): Promise<number> => 0),
    },
    // Caja obligatoria: create comprueba que haya una sesión OPEN. Por defecto
    // el mock devuelve una sesión abierta para que el camino feliz pase; los
    // tests que quieran probar "sin caja" sobrescriben este findFirst → null.
    cashSession: {
      findFirst: vi.fn(
        async (_a?: unknown): Promise<unknown> => ({ id: 'cash-1', status: 'OPEN' }),
      ),
    },
    // Stock: usado por applyMovement dentro de la tx (venta y voidSale).
    stock: {
      upsert: vi.fn(async (_a?: unknown): Promise<unknown> => ({ quantity: 0, minStock: 0 })),
    },
    stockMovement: {
      create: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'mov-1' })),
    },
    // applyMovement reevalúa la alerta de stock (#29).
    stockAlert: {
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => null),
      create: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'alert-1' })),
      update: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'alert-1' })),
    },
    // voidSale corre dentro de withTenantTx → el tx hace SELECT set_config.
    $executeRaw: vi.fn(async (): Promise<number> => 1),
  };
}

// Construye el servicio con el mismo mock como cliente extendido y base. voidSale
// abre withTenantTx(base): para que el callback opere sobre los mismos mocks,
// envolvemos el prisma mock en un base con $transaction que lo reutiliza como tx.
function makeService(prisma: ReturnType<typeof makePrisma>, base?: unknown) {
  const resolvedBase = base ?? {
    $transaction: vi.fn(async (fn: (t: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };
  return new SalesService(
    prisma as never,
    resolvedBase as never,
    new StockService({} as never, new MemoryCache(), {} as never, new InMemoryEventBus()),
    new InMemoryEventBus(),
    { recordFor: vi.fn(async () => ({ id: 'vf', hash: 'h', qrData: 'q' })) } as never,
  );
}

describe('SalesService.voidSale', () => {
  it('lanza 404 si la venta no existe', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.voidSale('nope', 'user-1')),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la venta ya está anulada (VOIDED)', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({ id: 'sale-1', status: 'VOIDED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.voidSale('sale-1', 'user-1')),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza 400 si la venta tiene devoluciones (no se puede anular)', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({ id: 'sale-1', status: 'COMPLETED' }));
    prisma.return.count = vi.fn(async () => 1);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.voidSale('sale-1', 'user-1')),
    ).rejects.toThrow(/devoluciones/);
    // No debe intentar el updateMany si hay devoluciones.
    expect(prisma.sale.updateMany).not.toHaveBeenCalled();
  });

  it('anula la venta: updateMany con count 1 → devuelve la venta VOIDED', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({
      id: 'sale-1',
      status: 'COMPLETED',
      storeId: 'store-1',
      lines: [{ productId: 'p1', qty: 2 }],
    }));
    prisma.sale.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.sale.findFirstOrThrow = vi.fn(async () => ({ id: 'sale-1', status: 'VOIDED' }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.voidSale('sale-1', 'user-1'),
    );

    // El WHERE del update viaja con status COMPLETED y el organizationId del tenant.
    const arg = prisma.sale.updateMany.mock.calls[0]![0] as {
      where: { status: string; organizationId: string };
      data: { status: string; voidedBy: string };
    };
    expect(arg.where.status).toBe('COMPLETED');
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.data.status).toBe('VOIDED');
    expect(arg.data.voidedBy).toBe('user-1');
    expect(result).toMatchObject({ id: 'sale-1', status: 'VOIDED' });
  });

  it('lanza 400 si updateMany afecta 0 filas (carrera concurrente)', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({ id: 'sale-1', status: 'COMPLETED' }));
    prisma.sale.updateMany = vi.fn(async () => ({ count: 0 }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.voidSale('sale-1', 'user-1')),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza 500 si no hay contexto de tenant', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await expect(service.voidSale('sale-1', 'user-1')).rejects.toThrow();
  });
});

describe('SalesService.getTicket', () => {
  it('lanza 404 si la venta no existe', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.getTicket('nope')),
    ).rejects.toThrow(NotFoundException);
  });

  it('devuelve el DTO del ticket con el taxBreakdown calculado', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({
      id: 'sale-1',
      ticketNumber: 'T01-000001',
      createdAt: new Date('2026-05-28T10:00:00Z'),
      subtotal: 231,
      discountTotal: 0,
      total: 231,
      paymentMethod: 'CASH',
      cashGiven: 250,
      cashChange: 19,
      organization: { name: 'Org SL', nif: 'B00000000' },
      store: { name: 'Tienda Centro', code: '01' },
      lines: [
        { name: 'A', qty: 1, unitPrice: 121, discountPct: 0, taxRate: 21, lineTotal: 121 },
        { name: 'B', qty: 1, unitPrice: 110, discountPct: 0, taxRate: 10, lineTotal: 110 },
      ],
    }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.getTicket('sale-1'),
    );

    // Filtra explícitamente por id y organizationId (defensa en profundidad).
    const arg = prisma.sale.findFirst.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(arg.where.id).toBe('sale-1');
    expect(arg.where.organizationId).toBe(ORG);

    expect(result.organization).toEqual({ name: 'Org SL', nif: 'B00000000' });
    expect(result.store).toEqual({ name: 'Tienda Centro', code: '01' });
    expect(result.ticketNumber).toBe('T01-000001');
    expect(result.lines).toHaveLength(2);

    // Sin descuento de ticket: Σ(base+cuota) == total. Grupos ordenados por tipo.
    const sum = result.taxBreakdown.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sum).toBeCloseTo(231, 2);
    expect(result.taxBreakdown.map((t) => t.taxRate)).toEqual([10, 21]);
  });

  it('calcula y prorratea el descuento de ticket en el taxBreakdown', async () => {
    const prisma = makePrisma();
    // subtotal 231, total 207.9 → descuento de ticket 23.1.
    prisma.sale.findFirst = vi.fn(async () => ({
      id: 'sale-2',
      ticketNumber: 'T01-000002',
      createdAt: new Date(),
      subtotal: 231,
      discountTotal: 23.1,
      total: 207.9,
      paymentMethod: 'CARD',
      cashGiven: null,
      cashChange: null,
      organization: { name: 'Org', nif: 'B1' },
      store: { name: 'T', code: '01' },
      lines: [
        { name: 'A', qty: 1, unitPrice: 121, discountPct: 0, taxRate: 21, lineTotal: 121 },
        { name: 'B', qty: 1, unitPrice: 110, discountPct: 0, taxRate: 10, lineTotal: 110 },
      ],
    }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.getTicket('sale-2'),
    );
    const sum = result.taxBreakdown.reduce((acc, t) => acc + t.base + t.cuota, 0);
    expect(sum).toBeCloseTo(207.9, 2);
  });
});

describe('SalesService.findByTicket', () => {
  it('lanza 404 si el ticket no existe en el tenant', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.findByTicket('T01-999999')),
    ).rejects.toThrow(NotFoundException);
  });

  it('devuelve la venta con líneas filtrando por ticketNumber y organizationId', async () => {
    const prisma = makePrisma();
    prisma.sale.findFirst = vi.fn(async () => ({
      id: 'sale-1',
      ticketNumber: 'T01-000001',
      lines: [{ id: 'sl-1' }],
    }));
    const service = makeService(prisma);

    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.findByTicket('T01-000001'),
    )) as { id: string };

    const arg = prisma.sale.findFirst.mock.calls[0]![0] as {
      where: { ticketNumber: string; organizationId: string };
    };
    expect(arg.where.ticketNumber).toBe('T01-000001');
    expect(arg.where.organizationId).toBe(ORG);
    expect(res.id).toBe('sale-1');
  });
});

describe('SalesService.create', () => {
  // Mock de withTenantTx vía base.$transaction: el callback recibe un tx con
  // $executeRaw, $queryRaw y sale.create. Así cubrimos el camino feliz de create
  // sin tocar la DB. Devolvemos el contador del Store y la venta creada.
  function makeBase(opts: { storeFound?: boolean } = {}) {
    const storeFound = opts.storeFound ?? true;
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => (storeFound ? [{ code: '01', ticketCounter: 7 }] : [])),
      sale: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'new-sale',
          ...data,
        })),
      },
      // applyMovement (tras sale.create) hace upsert de Stock + create de movimiento
      // + reevaluación de alerta (#29).
      stock: {
        upsert: vi.fn(async () => ({ quantity: 98, minStock: 0 })),
      },
      stockMovement: {
        create: vi.fn(async () => ({ id: 'mov-1' })),
      },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'alert-1' })),
        update: vi.fn(async () => ({ id: 'alert-1' })),
      },
    };
    return {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    };
  }

  it('camino feliz: precia desde productos, abre tx y crea la venta', async () => {
    const prisma = makePrisma();
    prisma.product.findMany = vi.fn(async () => [
      { id: 'p1', name: 'Café', salePrice: 1.5, taxRate: 21 },
    ]);
    const base = makeBase();
    const service = makeService(prisma, base);

    const dto = {
      storeId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'CASH' as const,
      cashGiven: 5,
      lines: [{ productId: 'p1', qty: 2 }],
    };

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(dto, 'user-1', 'ADMIN'),
    )) as unknown as { ticketNumber: string; total: number; organizationId: string };

    expect(base.$transaction).toHaveBeenCalledOnce();
    expect(base.__tx.sale.create).toHaveBeenCalledOnce();
    expect(result.ticketNumber).toBe('T01-000007');
    expect(result.total).toBeCloseTo(3, 2);
    expect(result.organizationId).toBe(ORG);
  });

  it('descuento de línea por importe fijo (€): persiste discountAmt y discountPct 0', async () => {
    const prisma = makePrisma();
    prisma.product.findMany = vi.fn(async () => [
      { id: 'p1', name: 'Café', salePrice: 10, taxRate: 21 },
    ]);
    const base = makeBase();
    const service = makeService(prisma, base);

    const dto = {
      storeId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'CASH' as const,
      cashGiven: 50,
      lines: [{ productId: 'p1', qty: 2, discountAmt: 5 }], // bruto 20 − 5 = neto 15
    };

    await tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'user-1', 'ADMIN'));

    const arg = base.__tx.sale.create.mock.calls[0]![0] as {
      data: {
        subtotal: number;
        total: number;
        lines: { create: Array<{ discountPct: number; discountAmt: number }> };
      };
    };
    expect(arg.data.subtotal).toBeCloseTo(15, 2);
    expect(arg.data.total).toBeCloseTo(15, 2);
    // El importe fijo manda: se persiste discountAmt y discountPct queda en 0.
    expect(arg.data.lines.create[0]!.discountAmt).toBeCloseTo(5, 2);
    expect(arg.data.lines.create[0]!.discountPct).toBe(0);
  });

  it('lanza 409 si no hay caja abierta en la tienda (caja obligatoria)', async () => {
    const prisma = makePrisma();
    // Sin sesión OPEN → la comprobación de caja falla antes de preciar líneas.
    prisma.cashSession.findFirst = vi.fn(async () => null);
    prisma.product.findMany = vi.fn(async () => [
      { id: 'p1', name: 'Café', salePrice: 1.5, taxRate: 21 },
    ]);
    const base = makeBase();
    const service = makeService(prisma, base);

    const dto = {
      storeId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'CASH' as const,
      cashGiven: 5,
      lines: [{ productId: 'p1', qty: 2 }],
    };

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'user-1', 'ADMIN')),
    ).rejects.toThrow(ConflictException);
    // No debe abrir la transacción de venta si no hay caja.
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('lanza 400 si un producto del carrito no existe', async () => {
    const prisma = makePrisma();
    prisma.product.findMany = vi.fn(async () => []);
    const service = makeService(prisma, makeBase());

    const dto = {
      storeId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'CARD' as const,
      lines: [{ productId: 'ghost', qty: 1 }],
    };

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'user-1', 'ADMIN')),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza 404 dentro de la tx si la tienda no existe', async () => {
    const prisma = makePrisma();
    prisma.product.findMany = vi.fn(async () => [
      { id: 'p1', name: 'Café', salePrice: 1.5, taxRate: 21 },
    ]);
    const base = makeBase({ storeFound: false });
    const service = makeService(prisma, base);

    const dto = {
      storeId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'CARD' as const,
      lines: [{ productId: 'p1', qty: 1 }],
    };

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'user-1', 'ADMIN')),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('SalesService.findSales', () => {
  const STORE = '22222222-2222-2222-2222-222222222222';

  it('lanza si no hay contexto de tenant', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await expect(service.findSales({})).rejects.toThrow();
  });

  it('sin filtros: where solo con organizationId, paginación por defecto (page 1, size 20)', async () => {
    const prisma = makePrisma();
    prisma.sale.findMany = vi.fn(async () => [{ id: 's1' }]);
    prisma.sale.count = vi.fn(async () => 1);
    const service = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () => service.findSales({}));

    const arg = prisma.sale.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      orderBy: { createdAt: string };
      skip: number;
      take: number;
    };
    expect(arg.where).toEqual({ organizationId: ORG });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(20);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(20);
    expect(res.totalItems).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it('con storeId y date: el where incluye storeId y createdAt en el rango del día', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.findSales({ storeId: STORE, date: '2026-05-28' }),
    );

    const arg = prisma.sale.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; storeId: string; createdAt: { gte: Date; lt: Date } };
    };
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.createdAt.gte.toISOString()).toBe('2026-05-28T00:00:00.000Z');
    expect(arg.where.createdAt.lt.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('paginación: page 3 con pageSize 10 → skip 20, take 10', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.findSales({ page: 3, pageSize: 10 }),
    );

    const arg = prisma.sale.findMany.mock.calls[0]![0] as { skip: number; take: number };
    expect(arg.skip).toBe(20);
    expect(arg.take).toBe(10);
    expect(res.page).toBe(3);
    expect(res.pageSize).toBe(10);
  });

  it('totals: el aggregate añade status COMPLETED al where (excluye VOIDED)', async () => {
    const prisma = makePrisma();
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 150.5 }, _count: 3 }));
    const service = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.findSales({ storeId: STORE }),
    );

    const arg = prisma.sale.aggregate.mock.calls[0]![0] as {
      where: { organizationId: string; storeId: string; status: string };
    };
    expect(arg.where.status).toBe('COMPLETED');
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.storeId).toBe(STORE);
    expect(res.totals).toEqual({ count: 3, totalAmount: 150.5 });
  });

  it('totals.totalAmount es 0 cuando no hay ventas COMPLETED (sum null)', async () => {
    const prisma = makePrisma();
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: null }, _count: 0 }));
    const service = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () => service.findSales({}));
    expect(res.totals).toEqual({ count: 0, totalAmount: 0 });
  });
});
