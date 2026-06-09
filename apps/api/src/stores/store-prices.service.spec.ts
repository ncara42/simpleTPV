import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { StorePricesService } from './store-prices.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';
const PRODUCT = '33333333-3333-3333-3333-333333333333';

/** Ejecuta fn dentro del contexto de tenant (el servicio llama a requireTenant). */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// Mock mínimo del cliente Prisma extendido. Por defecto el camino feliz: tienda y
// producto del tenant existen, sin membership de UserStore (irrelevante para
// ADMIN/MANAGER, que son org-wide). Los tests sobrescriben lo que necesiten.
function makePrisma(
  opts: {
    overrides?: unknown[];
    store?: unknown;
    product?: unknown;
    membership?: unknown;
  } = {},
) {
  return {
    storePrice: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.overrides ?? []),
      upsert: vi.fn(async (args: unknown) => args),
      deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
    store: {
      findFirst: vi.fn(async (..._a: unknown[]) =>
        opts.store === undefined ? { id: STORE } : opts.store,
      ),
    },
    product: {
      findFirst: vi.fn(async (..._a: unknown[]) =>
        opts.product === undefined ? { id: PRODUCT } : opts.product,
      ),
    },
    userStore: {
      findFirst: vi.fn(async (..._a: unknown[]) => opts.membership ?? null),
    },
  };
}

const ADMIN = { userId: 'user-admin', role: 'ADMIN' };
const CLERK = { userId: 'user-clerk', role: 'CLERK' };

describe('StorePricesService.list', () => {
  it('devuelve los overrides enriquecidos con nombre y PVP del producto', async () => {
    const prisma = makePrisma({
      overrides: [
        {
          id: 'sp-1',
          productId: PRODUCT,
          price: '7.5',
          product: { name: 'Aceite CBD 10%', salePrice: '10' },
        },
      ],
    });
    const service = new StorePricesService(prisma as never);

    const res = await run(() => service.list(STORE, ADMIN));

    expect(res).toEqual([
      {
        id: 'sp-1',
        productId: PRODUCT,
        price: '7.5',
        product: { name: 'Aceite CBD 10%', salePrice: '10' },
      },
    ]);
    // El findMany filtra por tienda y organización (defensa en profundidad + RLS).
    const where = (
      prisma.storePrice.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ storeId: STORE, organizationId: ORG });
  });

  it('un CLERK sin asignación a la tienda recibe 403 (SEC-01)', async () => {
    const prisma = makePrisma({ membership: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.list(STORE, CLERK))).rejects.toThrow(ForbiddenException);
    // No llega a leer los overrides si no pasa el control de acceso.
    expect(prisma.storePrice.findMany).not.toHaveBeenCalled();
  });
});

describe('StorePricesService.setPrice', () => {
  const dto = { productId: PRODUCT, price: 7.5 };

  it('hace upsert del override verificando tienda y producto del tenant', async () => {
    const prisma = makePrisma();
    const service = new StorePricesService(prisma as never);

    await run(() => service.setPrice(STORE, dto, ADMIN));

    expect(prisma.store.findFirst).toHaveBeenCalled();
    expect(prisma.product.findFirst).toHaveBeenCalled();
    const arg = prisma.storePrice.upsert.mock.calls[0]![0] as {
      where: { productId_storeId: { productId: string; storeId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.where.productId_storeId).toEqual({ productId: PRODUCT, storeId: STORE });
    expect(arg.create).toMatchObject({
      organizationId: ORG,
      storeId: STORE,
      productId: PRODUCT,
      price: 7.5,
    });
    expect(arg.update).toEqual({ price: 7.5 });
  });

  it('lanza 400 si la tienda no es del tenant (no escribe el override)', async () => {
    const prisma = makePrisma({ store: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.setPrice(STORE, dto, ADMIN))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.storePrice.upsert).not.toHaveBeenCalled();
  });

  it('lanza 400 si el producto no es del tenant (no escribe el override)', async () => {
    const prisma = makePrisma({ product: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.setPrice(STORE, dto, ADMIN))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.storePrice.upsert).not.toHaveBeenCalled();
  });

  it('un CLERK sin asignación a la tienda recibe 403 antes de escribir (SEC-01)', async () => {
    const prisma = makePrisma({ membership: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.setPrice(STORE, dto, CLERK))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.storePrice.upsert).not.toHaveBeenCalled();
  });
});

describe('StorePricesService.importCsv', () => {
  it('resuelve por SKU, upserta las válidas y reporta errores por fila', async () => {
    const prisma = makePrisma();
    // Resolver por SKU: BOL-1 existe, SIN-SKU no.
    prisma.product.findFirst = vi.fn(async (args: unknown) =>
      (args as { where: { sku: string } }).where.sku === 'BOL-1' ? { id: PRODUCT } : null,
    );
    const service = new StorePricesService(prisma as never);
    const csv = ['sku,price', 'BOL-1,5.50', ',1.00', 'SIN-SKU,9.99'].join('\n');

    const res = await run(() => service.importCsv(STORE, csv, ADMIN));

    expect(res.inserted).toBe(1);
    expect(res.errors.map((e) => e.row)).toEqual([3, 4]); // sin sku + sku inexistente
    expect(prisma.storePrice.upsert).toHaveBeenCalledTimes(1);
  });

  it('un CLERK sin asignación a la tienda recibe 403 antes de importar (SEC-01)', async () => {
    const prisma = makePrisma({ membership: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.importCsv(STORE, 'sku,price\nA,1', CLERK))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.storePrice.upsert).not.toHaveBeenCalled();
  });
});

describe('StorePricesService.removePrice', () => {
  it('borra el override de (tienda, producto) filtrando por organización', async () => {
    const prisma = makePrisma();
    const service = new StorePricesService(prisma as never);

    await run(() => service.removePrice(STORE, PRODUCT, ADMIN));

    const where = (
      prisma.storePrice.deleteMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toEqual({ storeId: STORE, productId: PRODUCT, organizationId: ORG });
  });

  it('un CLERK sin asignación a la tienda recibe 403 antes de borrar (SEC-01)', async () => {
    const prisma = makePrisma({ membership: null });
    const service = new StorePricesService(prisma as never);

    await expect(run(() => service.removePrice(STORE, PRODUCT, CLERK))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.storePrice.deleteMany).not.toHaveBeenCalled();
  });
});
