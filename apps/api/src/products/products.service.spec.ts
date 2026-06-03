import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { ProductsService } from './products.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

function makePrisma() {
  return {
    product: {
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'p1', ...(data as object) })),
      findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []),
      findFirst: vi.fn(async (_args?: unknown): Promise<unknown> => null),
      update: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'p1', ...(data as object) })),
      delete: vi.fn(async () => ({ id: 'p1' })),
      createMany: vi.fn(async (_a?: unknown): Promise<unknown> => ({ count: 0 })),
    },
  };
}

describe('ProductsService.create', () => {
  it('crea un producto con los datos dados y el organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Café', salePrice: 1.5 }),
    );

    expect(prisma.product.create).toHaveBeenCalledOnce();
    const arg = prisma.product.create.mock.calls[0]![0] as { data: { organizationId: string } };
    expect(arg.data.organizationId).toBe(ORG);
    expect(result).toMatchObject({ id: 'p1', name: 'Café', salePrice: 1.5 });
  });
});

describe('ProductsService.findAll', () => {
  it('sin search lista sin filtro de texto', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    await service.findAll();
    const arg = prisma.product.findMany.mock.calls[0]![0] as { where?: unknown };
    expect(arg?.where).toBeUndefined();
  });

  it('con search filtra por name/sku/barcode con ILIKE (insensitive contains)', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    await service.findAll('caf');
    const arg = prisma.product.findMany.mock.calls[0]![0] as {
      where: { OR: Array<Record<string, { contains: string; mode: string }>> };
    };
    const fields = arg.where.OR.map((c) => Object.keys(c)[0]);
    expect(fields).toEqual(expect.arrayContaining(['name', 'sku', 'barcode']));
    expect(arg.where.OR[0]!.name).toEqual({ contains: 'caf', mode: 'insensitive' });
  });

  it('con familyId filtra por familia', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    await service.findAll(undefined, 'fam-1');
    const arg = prisma.product.findMany.mock.calls[0]![0] as { where: { familyId: string } };
    expect(arg.where.familyId).toBe('fam-1');
  });

  it('combina search y familyId', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    await service.findAll('caf', 'fam-1');
    const arg = prisma.product.findMany.mock.calls[0]![0] as {
      where: { familyId: string; OR: unknown[] };
    };
    expect(arg.where.familyId).toBe('fam-1');
    expect(Array.isArray(arg.where.OR)).toBe(true);
  });
});

describe('ProductsService.findOne', () => {
  it('devuelve el producto si existe', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => ({ id: 'p1', name: 'Café' }));
    const service = new ProductsService(prisma as never);
    const result = await service.findOne('p1');
    expect(result).toMatchObject({ id: 'p1' });
  });

  it('lanza 404 si no existe', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => null);
    const service = new ProductsService(prisma as never);
    await expect(service.findOne('nope')).rejects.toThrow();
  });
});

describe('ProductsService.update / remove', () => {
  it('update modifica el producto existente', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => ({ id: 'p1', name: 'Café' }));
    const service = new ProductsService(prisma as never);
    const result = await service.update('p1', { name: 'Café con leche' });
    expect(prisma.product.update).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ name: 'Café con leche' });
  });

  it('update lanza 404 si no existe', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => null);
    const service = new ProductsService(prisma as never);
    await expect(service.update('nope', { name: 'x' })).rejects.toThrow();
  });

  it('remove borra el producto existente', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => ({ id: 'p1' }));
    const service = new ProductsService(prisma as never);
    await service.remove('p1');
    expect(prisma.product.delete).toHaveBeenCalledOnce();
  });
});

describe('ProductsService.findByBarcode', () => {
  it('devuelve el producto si existe el barcode', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => ({ id: 'p1', barcode: '8410' }));
    const service = new ProductsService(prisma as never);
    const result = await service.findByBarcode('8410');
    const arg = prisma.product.findFirst.mock.calls[0]![0] as { where: { barcode: string } };
    expect(arg.where.barcode).toBe('8410');
    expect(result).toMatchObject({ id: 'p1' });
  });

  it('lanza 404 si no existe el barcode', async () => {
    const prisma = makePrisma();
    prisma.product.findFirst = vi.fn(async () => null);
    const service = new ProductsService(prisma as never);
    await expect(service.findByBarcode('nope')).rejects.toThrow();
  });
});

describe('ProductsService.importCsv', () => {
  const ORG2 = '11111111-1111-1111-1111-111111111111';

  it('inserta filas válidas y devuelve resumen', async () => {
    const prisma = makePrisma();
    prisma.product.createMany = vi.fn(async (_a?: unknown): Promise<unknown> => ({ count: 2 }));
    const service = new ProductsService(prisma as never);
    const csv = 'name,salePrice,sku,barcode\nCafé,1.50,SKU1,8410\nTé,2.00,SKU2,8411\n';
    const result = (await tenantStorage.run({ organizationId: ORG2 }, () =>
      service.importCsv(csv),
    )) as { inserted: number; errors: Array<{ row: number; message: string }> };
    expect(result.inserted).toBe(2);
    expect(result.errors).toHaveLength(0);
    const arg = prisma.product.createMany.mock.calls[0]![0] as {
      data: Array<{ organizationId: string }>;
    };
    expect(arg.data).toHaveLength(2);
    expect(arg.data[0]!.organizationId).toBe(ORG2);
  });

  it('reporta errores por fila sin abortar las válidas', async () => {
    const prisma = makePrisma();
    prisma.product.createMany = vi.fn(
      async (a?: unknown): Promise<unknown> => ({
        count: (a as { data: unknown[] }).data.length,
      }),
    );
    const service = new ProductsService(prisma as never);
    // fila 2 sin precio numérico, fila 3 sin nombre → ambas inválidas; fila 1 válida
    const csv = 'name,salePrice\nCafé,1.50\nTé,abc\n,3.00\n';
    const result = (await tenantStorage.run({ organizationId: ORG2 }, () =>
      service.importCsv(csv),
    )) as { inserted: number; errors: Array<{ row: number; message: string }> };
    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4]); // filas de datos (1-indexed + cabecera)
  });

  it('SEC-16: rechaza precios negativos y fuera de rango (no son puerta trasera al @Min(0))', async () => {
    const prisma = makePrisma();
    prisma.product.createMany = vi.fn(
      async (a?: unknown): Promise<unknown> => ({ count: (a as { data: unknown[] }).data.length }),
    );
    const service = new ProductsService(prisma as never);
    // fila 1 válida; fila 2 precio negativo; fila 3 precio fuera de rango (Decimal 10,4).
    const csv = 'name,salePrice\nCafé,1.50\nTé,-5\nAgua,10000000\n';
    const result = (await tenantStorage.run({ organizationId: ORG2 }, () =>
      service.importCsv(csv),
    )) as { inserted: number; errors: Array<{ row: number; message: string }> };
    expect(result.inserted).toBe(1);
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4]);
    expect(result.errors.every((e) => /rango/.test(e.message))).toBe(true);
  });

  it('CSV vacío o solo cabecera no inserta nada', async () => {
    const prisma = makePrisma();
    const service = new ProductsService(prisma as never);
    const result = (await tenantStorage.run({ organizationId: ORG2 }, () =>
      service.importCsv('name,salePrice\n'),
    )) as { inserted: number; errors: unknown[] };
    expect(result.inserted).toBe(0);
  });
});
