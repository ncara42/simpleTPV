import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { PurchasesService, suggestQuantity } from './purchases.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const SUP = '22222222-2222-2222-2222-222222222222';
const STORE = '33333333-3333-3333-3333-333333333333';

// Cliente extendido: create valida supplier+store y crea el pedido. Usamos `in`
// (no `??`) para poder forzar null explícito en opts y probar los 400.
function makePrisma(opts: { supplier?: unknown; store?: unknown } = {}) {
  const supplier = 'supplier' in opts ? opts.supplier : { id: SUP };
  const store = 'store' in opts ? opts.store : { id: STORE };
  return {
    supplier: { findFirst: vi.fn(async () => supplier) },
    store: { findFirst: vi.fn(async () => store) },
    purchaseOrder: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'po1',
        ...data,
      })),
      findMany: vi.fn(async (_a?: unknown) => [{ id: 'po1' }]),
      findFirst: vi.fn(async (_a?: unknown) => ({ id: 'po1', status: 'DRAFT' })),
    },
  };
}

const dto = {
  supplierId: SUP,
  storeId: STORE,
  lines: [{ productId: 'p1', quantityOrdered: 10, unitCost: 2.5 }],
};

describe('PurchasesService.create', () => {
  it('crea el pedido en DRAFT con organizationId y createdBy', async () => {
    const prisma = makePrisma();
    const service = new PurchasesService(prisma as never, {} as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(dto, 'user-1'),
    )) as unknown as { organizationId: string; createdBy: string };
    expect(res.organizationId).toBe(ORG);
    expect(res.createdBy).toBe('user-1');
    const arg = prisma.purchaseOrder.create.mock.calls[0]![0] as {
      data: { lines: { create: unknown[] } };
    };
    expect(arg.data.lines.create).toHaveLength(1);
  });

  it('400 si el proveedor no pertenece al tenant', async () => {
    const prisma = makePrisma({ supplier: null });
    const service = new PurchasesService(prisma as never, {} as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'u')),
    ).rejects.toThrow(BadRequestException);
  });

  it('400 si la tienda destino no pertenece al tenant', async () => {
    const prisma = makePrisma({ store: null });
    const service = new PurchasesService(prisma as never, {} as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.create(dto, 'u')),
    ).rejects.toThrow(/Tienda destino/);
  });
});

// Para confirm: base.$transaction ejecuta el callback con un tx mockeado.
function makeTxBase(order: unknown, updateCount = 1) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    purchaseOrder: {
      findFirst: vi.fn(async () => order),
      updateMany: vi.fn(async () => ({ count: updateCount })),
      findFirstOrThrow: vi.fn(async () => ({ id: 'po1', status: 'CONFIRMED' })),
    },
  };
  return {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

describe('PurchasesService.confirm', () => {
  it('404 si no existe', async () => {
    const base = makeTxBase(null);
    const service = new PurchasesService({} as never, base as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.confirm('x')),
    ).rejects.toThrow(NotFoundException);
  });

  it('409 si no está en DRAFT', async () => {
    const base = makeTxBase({ id: 'po1', status: 'CONFIRMED' });
    const service = new PurchasesService({} as never, base as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.confirm('po1')),
    ).rejects.toThrow(ConflictException);
  });

  it('DRAFT → CONFIRMED', async () => {
    const base = makeTxBase({ id: 'po1', status: 'DRAFT' });
    const service = new PurchasesService({} as never, base as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.confirm('po1'),
    )) as unknown as { status: string };
    expect(res.status).toBe('CONFIRMED');
  });

  it('409 si updateMany afecta 0 filas (carrera)', async () => {
    const base = makeTxBase({ id: 'po1', status: 'DRAFT' }, 0);
    const service = new PurchasesService({} as never, base as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.confirm('po1')),
    ).rejects.toThrow(/ya fue confirmado/);
  });
});

describe('PurchasesService.list', () => {
  it('filtra por estado y organizationId', async () => {
    const prisma = makePrisma();
    const service = new PurchasesService(prisma as never, {} as never);
    await tenantStorage.run({ organizationId: ORG }, () => service.list('CONFIRMED'));
    const arg = prisma.purchaseOrder.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; status?: string };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.status).toBe('CONFIRMED');
  });

  it('list sin estado no incluye status en el where', async () => {
    const prisma = makePrisma();
    const service = new PurchasesService(prisma as never, {} as never);
    await tenantStorage.run({ organizationId: ORG }, () => service.list());
    const arg = prisma.purchaseOrder.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where.status).toBeUndefined();
  });
});

describe('PurchasesService.get', () => {
  it('devuelve el pedido del tenant con líneas', async () => {
    const prisma = makePrisma();
    const service = new PurchasesService(prisma as never, {} as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.get('po1'),
    )) as unknown as { id: string };
    expect(res.id).toBe('po1');
    const arg = prisma.purchaseOrder.findFirst.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(arg.where.organizationId).toBe(ORG);
  });

  it('404 si no existe en el tenant', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findFirst = vi.fn(async (_a?: unknown) => null) as never;
    const service = new PurchasesService(prisma as never, {} as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.get('nope')),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('suggestQuantity', () => {
  it('cubre el déficit hasta el mínimo más la demanda de cobertura', () => {
    // min 10, stock 4, venta 2/día, 14 días → 10-4+2*14 = 34.
    expect(suggestQuantity(10, 4, 2, 14)).toBe(34);
  });

  it('nunca negativa: stock muy por encima del mínimo y sin ventas → 0', () => {
    expect(suggestQuantity(5, 100, 0, 14)).toBe(0);
  });

  it('sin mínimo ni stock, solo demanda esperada', () => {
    expect(suggestQuantity(0, 0, 1.5, 10)).toBe(15);
  });

  it('redondea a 3 decimales', () => {
    expect(suggestQuantity(0, 0, 0.3333, 3)).toBeCloseTo(1, 3);
  });
});

describe('PurchasesService.suggest', () => {
  function makeSuggestPrisma(
    stock: Array<{ productId: string; quantity: number; minStock: number; name: string }>,
    sales: Array<{ productId: string; quantity: number }>,
  ) {
    return {
      stock: {
        findMany: vi.fn(async (_a?: unknown) =>
          stock.map((s) => ({
            productId: s.productId,
            quantity: s.quantity,
            minStock: s.minStock,
            product: { name: s.name },
          })),
        ),
      },
      stockMovement: {
        findMany: vi.fn(async (_a?: unknown) => sales),
      },
    };
  }

  it('calcula cantidad sugerida y contexto; filtra los que no necesitan pedido', async () => {
    // p1: min 10, stock 2, vendió 60 en 30d (2/día) → 10-2+2*14=36 → se incluye.
    // p2: min 5, stock 100, sin ventas → 0 → se excluye.
    const prisma = makeSuggestPrisma(
      [
        { productId: 'p1', quantity: 2, minStock: 10, name: 'Café' },
        { productId: 'p2', quantity: 100, minStock: 5, name: 'Té' },
      ],
      [
        { productId: 'p1', quantity: -30 },
        { productId: 'p1', quantity: -30 },
      ],
    );
    const service = new PurchasesService(prisma as never, {} as never);

    const rows = await tenantStorage.run({ organizationId: ORG }, () =>
      service.suggest({ storeId: STORE }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.productId).toBe('p1');
    expect(rows[0]!.ventaMedia30d).toBe(60);
    expect(rows[0]!.ventaMediaDiaria).toBe(2);
    expect(rows[0]!.cantidadSugerida).toBe(36);
    expect(rows[0]!.coberturaDias).toBe(1); // stock 2 / 2 por día
  });

  it('usa daysCoverage del dto', async () => {
    const prisma = makeSuggestPrisma(
      [{ productId: 'p1', quantity: 0, minStock: 0, name: 'X' }],
      [{ productId: 'p1', quantity: -30 }],
    );
    const service = new PurchasesService(prisma as never, {} as never);
    const rows = await tenantStorage.run({ organizationId: ORG }, () =>
      service.suggest({ storeId: STORE, daysCoverage: 7 }),
    );
    // venta 1/día * 7 = 7.
    expect(rows[0]!.cantidadSugerida).toBe(7);
  });
});
