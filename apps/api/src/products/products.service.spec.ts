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
