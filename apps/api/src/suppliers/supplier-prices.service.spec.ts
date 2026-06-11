import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { SupplierPricesService } from './supplier-prices.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    supplier: { findFirst: vi.fn(async () => ({ id: 'sup1' })) },
    product: { findFirst: vi.fn(async () => ({ id: 'p1' })) },
    supplierPrice: {
      findMany: vi.fn(async (): Promise<unknown[]> => []),
      findFirst: vi.fn(async () => ({ id: 'sp1' })),
      upsert: vi.fn(async () => ({
        id: 'sp1',
        supplierId: 'sup1',
        productId: 'p1',
        price: '3.5000',
        supplier: { name: 'Prov A' },
        product: { name: 'Bolígrafo', sku: 'BOL-1' },
      })),
      delete: vi.fn(async () => ({ id: 'sp1' })),
    },
    ...over,
  };
}

describe('SupplierPricesService', () => {
  it('upsert valida pertenencia y devuelve la fila mapeada', async () => {
    const prisma = makePrisma();
    const service = new SupplierPricesService(prisma as never);
    const res = await run(() =>
      service.upsert({ supplierId: 'sup1', productId: 'p1', price: 3.5 }),
    );
    expect(res.price).toBe(3.5);
    expect(res.supplierName).toBe('Prov A');
    expect(res.sku).toBe('BOL-1');
    const arg = (prisma.supplierPrice.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      create: { organizationId: string };
    };
    expect(arg.create.organizationId).toBe(ORG);
  });

  it('upsert rechaza proveedor inexistente', async () => {
    const prisma = makePrisma({ supplier: { findFirst: vi.fn(async () => null) } });
    const service = new SupplierPricesService(prisma as never);
    await expect(
      run(() => service.upsert({ supplierId: 'nope', productId: 'p1', price: 1 })),
    ).rejects.toThrow();
  });

  it('comparison agrupa por producto y marca el más barato', async () => {
    const prisma = makePrisma({
      supplierPrice: {
        findMany: vi.fn(async () => [
          {
            productId: 'p1',
            supplierId: 'sA',
            price: '2.00',
            supplier: { name: 'A' },
            product: { name: 'Bolígrafo', sku: 'BOL-1' },
          },
          {
            productId: 'p1',
            supplierId: 'sB',
            price: '3.00',
            supplier: { name: 'B' },
            product: { name: 'Bolígrafo', sku: 'BOL-1' },
          },
        ]),
      },
    });
    const service = new SupplierPricesService(prisma as never);
    const res = await run(() => service.comparison('fam1'));
    expect(res).toHaveLength(1);
    expect(res[0]!.prices).toHaveLength(2);
    expect(res[0]!.best).toEqual({ supplierId: 'sA', supplierName: 'A', price: 2 });
  });

  it('importCsv resuelve por SKU e informa errores por fila', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'pA' }) // BOL-1 existe
      .mockResolvedValueOnce(null); // SIN-SKU no existe
    const prisma = makePrisma({
      product: { findFirst },
      supplierPrice: { upsert: vi.fn(async () => ({})) },
    });
    const service = new SupplierPricesService(prisma as never);
    const csv = ['sku,price', 'BOL-1,2.50', ',1.00', 'SIN-SKU,9.99'].join('\n');
    const res = await run(() => service.importCsv({ supplierId: 'sup1', csv }));
    expect(res.inserted).toBe(1); // solo BOL-1
    expect(res.errors.map((e) => e.row)).toEqual([3, 4]); // fila sin sku + sku inexistente
  });
});
