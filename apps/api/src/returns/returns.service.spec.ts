import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { StockService } from '../stock/stock.service.js';
import { computeReturnable, computeReturnLineTotal, ReturnsService } from './returns.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('computeReturnLineTotal', () => {
  it('proporción del neto de la línea por la cantidad devuelta', () => {
    // SaleLine: neto 30 por 3 uds → unitario neto 10. Devolver 2 → 20.
    expect(computeReturnLineTotal(30, 3, 2)).toBeCloseTo(20, 2);
  });

  it('devolver la línea entera devuelve el neto completo', () => {
    expect(computeReturnLineTotal(18, 2, 2)).toBeCloseTo(18, 2);
  });

  it('redondea a 2 decimales', () => {
    // neto 10 por 3 uds → 3.3333... por unidad; devolver 1 → 3.33.
    expect(computeReturnLineTotal(10, 3, 1)).toBeCloseTo(3.33, 2);
  });

  it('saleLineQty 0 no divide por cero → 0', () => {
    expect(computeReturnLineTotal(10, 0, 1)).toBe(0);
  });
});

describe('computeReturnable', () => {
  it('vendido − ya devuelto', () => {
    expect(computeReturnable(5, 2)).toBeCloseTo(3, 2);
  });

  it('sin devoluciones previas: todo lo vendido', () => {
    expect(computeReturnable(4, 0)).toBeCloseTo(4, 2);
  });

  it('nunca negativo', () => {
    expect(computeReturnable(2, 5)).toBe(0);
  });
});

// Mock del cliente Prisma extendido (lecturas, p.ej. list).
function makePrisma() {
  return {
    return: {
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
    },
  };
}

// Mock del cliente base: su $transaction recibe un tx con sale.findFirst,
// returnLine.findMany y return.create. Configurable por test.
function makeBase(
  opts: {
    sale?: unknown;
    previous?: Array<{ saleLineId: string; qty: number }>;
  } = {},
) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    sale: {
      findFirst: vi.fn(async () => opts.sale ?? null),
    },
    returnLine: {
      findMany: vi.fn(async () => opts.previous ?? []),
    },
    return: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-return',
        ...data,
        lines: (data.lines as { create: unknown[] }).create,
      })),
    },
    // applyMovement (tras return.create) repone el stock de cada línea devuelta.
    stock: {
      upsert: vi.fn(async () => ({ quantity: 102 })),
    },
    stockMovement: {
      create: vi.fn(async () => ({ id: 'mov-1' })),
    },
  };
  return {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, base: unknown) {
  return new ReturnsService(prisma as never, base as never, new StockService());
}

// Venta de ejemplo con dos líneas (helper para los tests de create).
function sampleSale() {
  return {
    id: 'sale-1',
    storeId: 'store-1',
    status: 'COMPLETED',
    lines: [
      { id: 'sl-1', productId: 'p1', qty: 3, lineTotal: 30 },
      { id: 'sl-2', productId: 'p2', qty: 2, lineTotal: 18 },
    ],
  };
}

describe('ReturnsService.create', () => {
  it('lanza 404 si la venta no existe', async () => {
    const base = makeBase({ sale: null });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'nope', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
          'user-1',
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la venta está anulada (VOIDED)', async () => {
    const base = makeBase({ sale: { ...sampleSale(), status: 'VOIDED' } });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
          'user-1',
        ),
      ),
    ).rejects.toThrow(/anulada/);
  });

  it('lanza 400 si la línea no pertenece a la venta', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'ajena', qty: 1 }] },
          'user-1',
        ),
      ),
    ).rejects.toThrow(/no pertenece a la venta/);
  });

  it('lanza 400 si se devuelve más de lo vendido', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        // sl-1 vendió 3, pedimos 4.
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 4 }] },
          'user-1',
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);
  });

  it('con devolución previa el disponible baja → exceso lanza 400', async () => {
    // sl-1 vendió 3, ya se devolvieron 2 → disponible 1. Pedir 2 → error.
    const base = makeBase({ sale: sampleSale(), previous: [{ saleLineId: 'sl-1', qty: 2 }] });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 2 }] },
          'user-1',
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);
  });

  it('éxito: crea Return con líneas, total y organizationId correctos', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        {
          saleId: 'sale-1',
          reason: 'producto defectuoso',
          lines: [{ saleLineId: 'sl-1', qty: 2 }],
        },
        'user-1',
      ),
    )) as unknown as {
      organizationId: string;
      storeId: string;
      userId: string;
      reason: string;
      total: number;
      lines: Array<{ organizationId: string; productId: string; qty: number; lineTotal: number }>;
    };

    expect(base.$transaction).toHaveBeenCalledOnce();
    expect(base.__tx.return.create).toHaveBeenCalledOnce();
    expect(result.organizationId).toBe(ORG);
    expect(result.storeId).toBe('store-1');
    expect(result.userId).toBe('user-1');
    expect(result.reason).toBe('producto defectuoso');
    // sl-1: neto 30 por 3 uds → 10/ud. Devolver 2 → 20.
    expect(result.total).toBeCloseTo(20, 2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.organizationId).toBe(ORG);
    expect(result.lines[0]!.productId).toBe('p1');
    expect(result.lines[0]!.lineTotal).toBeCloseTo(20, 2);
  });

  it('éxito con devolución previa parcial: permite devolver el resto disponible', async () => {
    // sl-1 vendió 3, ya devueltos 2 → disponible 1. Devolver 1 → OK, total 10.
    const base = makeBase({ sale: sampleSale(), previous: [{ saleLineId: 'sl-1', qty: 2 }] });
    const service = makeService(makePrisma(), base);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        { saleId: 'sale-1', reason: 'resto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
        'user-1',
      ),
    )) as unknown as { total: number };
    expect(result.total).toBeCloseTo(10, 2);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = makeService(makePrisma(), makeBase());
    await expect(
      service.create(
        { saleId: 'sale-1', reason: 'x', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
        'user-1',
      ),
    ).rejects.toThrow();
  });
});

describe('ReturnsService.list', () => {
  it('filtra por saleId y organizationId del tenant', async () => {
    const prisma = makePrisma();
    prisma.return.findMany = vi.fn(async () => [{ id: 'r1' }]);
    const service = makeService(prisma, makeBase());

    const res = await tenantStorage.run({ organizationId: ORG }, () => service.list('sale-1'));

    const arg = prisma.return.findMany.mock.calls[0]![0] as {
      where: { saleId: string; organizationId: string };
    };
    expect(arg.where.saleId).toBe('sale-1');
    expect(arg.where.organizationId).toBe(ORG);
    expect(res).toHaveLength(1);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = makeService(makePrisma(), makeBase());
    await expect(service.list('sale-1')).rejects.toThrow();
  });
});
