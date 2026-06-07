import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { PublicController } from './public.controller.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// Fila de stock con su producto embebido (forma que devuelve Prisma según el select).
function stockRow(productId: string, sku: string, name: string, storeId: string, qty: number) {
  return {
    storeId,
    quantity: qty,
    product: { id: productId, sku, name },
  };
}

function makePrisma() {
  return {
    stock: {
      findMany: vi.fn(async (..._a: unknown[]): Promise<ReturnType<typeof stockRow>[]> => []),
    },
    priceListItem: {
      findMany: vi.fn(
        async (
          ..._a: unknown[]
        ): Promise<Array<{ productId: string; price: number | string }>> => [],
      ),
    },
  };
}

function makeController(prisma: ReturnType<typeof makePrisma>) {
  return new PublicController(prisma as never);
}

describe('PublicController.stock', () => {
  it('sin priceListId no consulta priceListItem y devuelve wholesalePrice null', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => [
      stockRow('p-1', 'SKU-1', 'Producto A', 'store-1', 10),
    ]);

    const controller = makeController(prisma);
    const req = { apiKey: undefined };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    // No debe haber llamado a priceListItem.findMany
    expect(prisma.priceListItem.findMany).not.toHaveBeenCalled();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      productId: 'p-1',
      sku: 'SKU-1',
      name: 'Producto A',
      storeId: 'store-1',
      quantity: 10,
      wholesalePrice: null,
    });
  });

  it('con priceListId nulo en apiKey no consulta priceListItem', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => [
      stockRow('p-2', 'SKU-2', 'Producto B', 'store-1', 5),
    ]);

    const controller = makeController(prisma);
    const req = { apiKey: { priceListId: null, organizationId: ORG, apiKeyId: 'key-1' } };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    expect(prisma.priceListItem.findMany).not.toHaveBeenCalled();
    expect(result[0]!.wholesalePrice).toBeNull();
  });

  it('con priceListId consulta priceListItem y mapea wholesalePrice', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => [
      stockRow('p-1', 'SKU-1', 'Producto A', 'store-1', 7),
      stockRow('p-2', 'SKU-2', 'Producto B', 'store-2', 3),
    ]);
    // p-1 tiene precio en la tarifa, p-2 no
    prisma.priceListItem.findMany = vi.fn(async (..._a: unknown[]) => [
      { productId: 'p-1', price: '12.50' },
    ]);

    const controller = makeController(prisma);
    const req = {
      apiKey: { priceListId: 'pl-1', organizationId: ORG, apiKeyId: 'key-1' },
    };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    // Se llamó a priceListItem.findMany con el priceListId y organizationId correctos
    const plArg = prisma.priceListItem.findMany.mock.calls[0]![0] as {
      where: { priceListId: string; organizationId: string };
    };
    expect(plArg.where.priceListId).toBe('pl-1');
    expect(plArg.where.organizationId).toBe(ORG);

    // p-1 tiene precio de tarifa
    expect(result.find((r) => r.productId === 'p-1')!.wholesalePrice).toBeCloseTo(12.5, 4);
    // p-2 no tiene precio en la tarifa → null
    expect(result.find((r) => r.productId === 'p-2')!.wholesalePrice).toBeNull();
  });

  it('quantity se convierte a Number aunque llegue como Decimal/string de Prisma', async () => {
    const prisma = makePrisma();
    // Simulamos que Prisma devuelve un Decimal-like (con valueOf/toString) en lugar de number
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => [
      {
        storeId: 'store-1',
        quantity: '42' as unknown as number, // simula Decimal
        product: { id: 'p-1', sku: 'SKU-1', name: 'Test' },
      },
    ]);

    const controller = makeController(prisma);
    const req = { apiKey: undefined };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    expect(typeof result[0]!.quantity).toBe('number');
    expect(result[0]!.quantity).toBe(42);
  });

  it('con query.storeId pasa el filtro a stock.findMany', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => []);

    const controller = makeController(prisma);
    const req = { apiKey: undefined };

    await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, { storeId: 'store-X' }),
    );

    const stockArg = prisma.stock.findMany.mock.calls[0]![0] as {
      where: { storeId?: string; organizationId: string };
    };
    expect(stockArg.where.storeId).toBe('store-X');
    expect(stockArg.where.organizationId).toBe(ORG);
  });

  it('sin query.storeId no incluye storeId en el filtro', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => []);

    const controller = makeController(prisma);
    const req = { apiKey: undefined };

    await tenantStorage.run({ organizationId: ORG }, () => controller.stock(req as never, {}));

    const stockArg = prisma.stock.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    // No debe incluir storeId en el filtro
    expect(stockArg.where).not.toHaveProperty('storeId');
  });

  it('devuelve array vacío cuando no hay stock', async () => {
    const prisma = makePrisma();
    // findMany ya devuelve [] por defecto

    const controller = makeController(prisma);
    const req = { apiKey: undefined };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    expect(result).toEqual([]);
  });

  it('precio de tarifa se convierte a number con Number(price)', async () => {
    const prisma = makePrisma();
    prisma.stock.findMany = vi.fn(async (..._a: unknown[]) => [
      stockRow('p-5', 'SKU-5', 'Test', 'store-1', 1),
    ]);
    // Precio con decimales como string (Decimal de Prisma)
    prisma.priceListItem.findMany = vi.fn(async (..._a: unknown[]) => [
      { productId: 'p-5', price: '9.9999' },
    ]);

    const controller = makeController(prisma);
    const req = { apiKey: { priceListId: 'pl-2', organizationId: ORG, apiKeyId: 'key-2' } };

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      controller.stock(req as never, {}),
    );

    expect(typeof result[0]!.wholesalePrice).toBe('number');
    expect(result[0]!.wholesalePrice).toBeCloseTo(9.9999, 4);
  });
});
