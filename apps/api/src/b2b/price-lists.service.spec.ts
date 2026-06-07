import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { PriceListsService } from './price-lists.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

/** Ejecuta fn dentro del contexto de tenant. */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mocks
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(
  opts: {
    priceLists?: unknown[];
    priceList?: unknown;
    createdPriceList?: unknown;
    updatedPriceList?: unknown;
    priceListForSetItem?: unknown;
    productForSetItem?: unknown;
    upsertedItem?: unknown;
  } = {},
) {
  return {
    priceList: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.priceLists ?? []),
      findFirst: vi.fn(async (..._a: unknown[]) => opts.priceList ?? null),
      create: vi.fn(async (args: unknown) => opts.createdPriceList ?? args),
      updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
    product: {
      findFirst: vi.fn(async (..._a: unknown[]) => opts.productForSetItem ?? null),
    },
    priceListItem: {
      upsert: vi.fn(async (args: unknown) => opts.upsertedItem ?? args),
      deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.list
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.list', () => {
  it('mapea correctamente los _count de items y customers', async () => {
    const rows = [
      {
        id: 'pl-1',
        name: 'Tarifa A',
        active: true,
        _count: { items: 5, customers: 2 },
      },
      {
        id: 'pl-2',
        name: 'Tarifa B',
        active: false,
        _count: { items: 0, customers: 1 },
      },
    ];
    const prisma = makePrisma({ priceLists: rows });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.list());

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'pl-1',
      name: 'Tarifa A',
      active: true,
      itemCount: 5,
      customerCount: 2,
    });
    expect(result[1]).toMatchObject({
      id: 'pl-2',
      name: 'Tarifa B',
      active: false,
      itemCount: 0,
      customerCount: 1,
    });
  });

  it('devuelve array vacío cuando no hay tarifas', async () => {
    const prisma = makePrisma({ priceLists: [] });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.list());
    expect(result).toEqual([]);
  });

  it('filtra por organizationId del tenant en la consulta', async () => {
    const prisma = makePrisma({ priceLists: [] });
    const service = new PriceListsService(prisma as never);

    await run(() => service.list());

    const findArg = prisma.priceList.findMany.mock.calls[0]![0] as {
      where: { organizationId: string };
    };
    expect(findArg.where.organizationId).toBe(ORG);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makePrisma() as never);
    await expect(service.list()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.get
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.get', () => {
  it('llama a findFirst con id y organizationId', async () => {
    const pl = { id: 'pl-1', name: 'T', active: true, items: [] };
    const prisma = makePrisma({ priceList: pl });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.get('pl-1'));

    const findArg = prisma.priceList.findFirst.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(findArg.where.id).toBe('pl-1');
    expect(findArg.where.organizationId).toBe(ORG);
    expect(result).toBe(pl);
  });

  it('devuelve null si la tarifa no existe en el tenant', async () => {
    const prisma = makePrisma({ priceList: null });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.get('nope'));
    expect(result).toBeNull();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makePrisma() as never);
    await expect(service.get('pl-1')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.create
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.create', () => {
  it('crea la tarifa con organizationId del tenant y el nombre indicado', async () => {
    const created = { id: 'pl-new', organizationId: ORG, name: 'Tarifa VIP', active: true };
    const prisma = makePrisma({ createdPriceList: created });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.create({ name: 'Tarifa VIP' }));

    const createArg = prisma.priceList.create.mock.calls[0]![0] as {
      data: { organizationId: string; name: string };
    };
    expect(createArg.data.organizationId).toBe(ORG);
    expect(createArg.data.name).toBe('Tarifa VIP');
    expect(result).toBe(created);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makePrisma() as never);
    await expect(service.create({ name: 'X' })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.update
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.update', () => {
  function makeUpdatePrisma(updatedPl: unknown) {
    return {
      priceList: {
        findMany: vi.fn(async (..._a: unknown[]) => []),
        findFirst: vi.fn(async (..._a: unknown[]) => updatedPl),
        create: vi.fn(async (..._a: unknown[]) => ({})),
        updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
        deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      },
      product: { findFirst: vi.fn(async (..._a: unknown[]) => null) },
      priceListItem: {
        upsert: vi.fn(async (..._a: unknown[]) => ({})),
        deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      },
    };
  }

  it('actualiza el name cuando se proporciona', async () => {
    const updated = { id: 'pl-1', name: 'Nuevo nombre', active: true };
    const prisma = makeUpdatePrisma(updated);
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.update('pl-1', { name: 'Nuevo nombre' }));

    const updateArg = prisma.priceList.updateMany.mock.calls[0]![0] as {
      data: { name?: string; active?: boolean };
    };
    expect(updateArg.data.name).toBe('Nuevo nombre');
    expect(updateArg.data.active).toBeUndefined();
    expect(result).toBe(updated);
  });

  it('actualiza active cuando se proporciona', async () => {
    const updated = { id: 'pl-1', name: 'T', active: false };
    const prisma = makeUpdatePrisma(updated);
    const service = new PriceListsService(prisma as never);

    await run(() => service.update('pl-1', { active: false }));

    const updateArg = prisma.priceList.updateMany.mock.calls[0]![0] as {
      data: { name?: string; active?: boolean };
    };
    expect(updateArg.data.active).toBe(false);
    expect(updateArg.data.name).toBeUndefined();
  });

  it('actualiza name y active simultáneamente', async () => {
    const updated = { id: 'pl-1', name: 'V', active: false };
    const prisma = makeUpdatePrisma(updated);
    const service = new PriceListsService(prisma as never);

    await run(() => service.update('pl-1', { name: 'V', active: false }));

    const updateArg = prisma.priceList.updateMany.mock.calls[0]![0] as {
      data: { name?: string; active?: boolean };
    };
    expect(updateArg.data.name).toBe('V');
    expect(updateArg.data.active).toBe(false);
  });

  it('no incluye campos no proporcionados en data', async () => {
    const prisma = makeUpdatePrisma({ id: 'pl-1', name: 'T', active: true });
    const service = new PriceListsService(prisma as never);

    // DTO vacío: sin name ni active.
    await run(() => service.update('pl-1', {}));

    const updateArg = prisma.priceList.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateArg.data)).toHaveLength(0);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makeUpdatePrisma({}) as never);
    await expect(service.update('pl-1', { name: 'X' })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.remove
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.remove', () => {
  it('llama a deleteMany con id y organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new PriceListsService(prisma as never);

    await run(() => service.remove('pl-1'));

    const deleteArg = prisma.priceList.deleteMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(deleteArg.where.id).toBe('pl-1');
    expect(deleteArg.where.organizationId).toBe(ORG);
  });

  it('devuelve undefined (void)', async () => {
    const prisma = makePrisma();
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.remove('pl-1'));
    expect(result).toBeUndefined();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makePrisma() as never);
    await expect(service.remove('pl-1')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.setItem
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.setItem', () => {
  /** Prisma con priceList.findFirst y product.findFirst configurables. */
  function makeSetItemPrisma(opts: {
    priceListFound?: boolean;
    productFound?: boolean;
    upserted?: unknown;
  }) {
    const plRow = opts.priceListFound !== false ? { id: 'pl-1' } : null;
    const prodRow = opts.productFound !== false ? { id: 'prod-1' } : null;
    const upserted = opts.upserted ?? { priceListId: 'pl-1', productId: 'prod-1', price: 7.5 };

    return {
      priceList: {
        findMany: vi.fn(async (..._a: unknown[]) => []),
        findFirst: vi.fn(async (..._a: unknown[]) => plRow),
        create: vi.fn(async (..._a: unknown[]) => ({})),
        updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 0 })),
        deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 0 })),
      },
      product: {
        findFirst: vi.fn(async (..._a: unknown[]) => prodRow),
      },
      priceListItem: {
        upsert: vi.fn(async (..._a: unknown[]) => upserted),
        deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 0 })),
      },
    };
  }

  it('lanza 400 si la tarifa no existe en el tenant', async () => {
    const prisma = makeSetItemPrisma({ priceListFound: false });
    const service = new PriceListsService(prisma as never);

    await expect(
      run(() => service.setItem('pl-1', { productId: 'prod-1', price: 7.5 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      run(() => service.setItem('pl-1', { productId: 'prod-1', price: 7.5 })),
    ).rejects.toThrow(/Tarifa no encontrada/);
  });

  it('lanza 400 si el producto no existe en el tenant', async () => {
    const prisma = makeSetItemPrisma({ priceListFound: true, productFound: false });
    const service = new PriceListsService(prisma as never);

    await expect(
      run(() => service.setItem('pl-1', { productId: 'prod-x', price: 5 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      run(() => service.setItem('pl-1', { productId: 'prod-x', price: 5 })),
    ).rejects.toThrow(/Producto no encontrado/);
  });

  it('realiza el upsert cuando tarifa y producto existen', async () => {
    const upserted = { priceListId: 'pl-1', productId: 'prod-1', price: 7.5 };
    const prisma = makeSetItemPrisma({ upserted });
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.setItem('pl-1', { productId: 'prod-1', price: 7.5 }));

    expect(prisma.priceListItem.upsert).toHaveBeenCalledOnce();
    const upsertArg = prisma.priceListItem.upsert.mock.calls[0]![0] as {
      create: { organizationId: string; priceListId: string; productId: string; price: number };
      update: { price: number };
    };
    expect(upsertArg.create.organizationId).toBe(ORG);
    expect(upsertArg.create.priceListId).toBe('pl-1');
    expect(upsertArg.create.productId).toBe('prod-1');
    expect(upsertArg.create.price).toBe(7.5);
    expect(upsertArg.update.price).toBe(7.5);
    expect(result).toBe(upserted);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const prisma = makeSetItemPrisma({});
    const service = new PriceListsService(prisma as never);

    await expect(service.setItem('pl-1', { productId: 'prod-1', price: 5 })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PriceListsService.removeItem
// ─────────────────────────────────────────────────────────────────────────────

describe('PriceListsService.removeItem', () => {
  it('llama a deleteMany con priceListId, productId y organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new PriceListsService(prisma as never);

    await run(() => service.removeItem('pl-1', 'prod-1'));

    const deleteArg = prisma.priceListItem.deleteMany.mock.calls[0]![0] as {
      where: { priceListId: string; productId: string; organizationId: string };
    };
    expect(deleteArg.where.priceListId).toBe('pl-1');
    expect(deleteArg.where.productId).toBe('prod-1');
    expect(deleteArg.where.organizationId).toBe(ORG);
  });

  it('devuelve undefined (void)', async () => {
    const prisma = makePrisma();
    const service = new PriceListsService(prisma as never);

    const result = await run(() => service.removeItem('pl-1', 'prod-1'));
    expect(result).toBeUndefined();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new PriceListsService(makePrisma() as never);
    await expect(service.removeItem('pl-1', 'prod-1')).rejects.toThrow();
  });
});
