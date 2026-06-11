import { describe, expect, it, vi } from 'vitest';

import { StorePricesController } from './store-prices.controller.js';

// Controller fino: delega en StorePricesService mapeando req.user (sub/role) al
// "actor" que el servicio usa para assertStoreAccess (SEC-01). Instanciamos sin
// NestJS para verificar el cableado de argumentos.

function makeService() {
  return {
    list: vi.fn(async () => [{ id: 'sp-1', productId: 'p-1', price: '7.5' }]),
    setPrice: vi.fn(async (storeId: string, dto: unknown) => ({ storeId, ...(dto as object) })),
    importCsv: vi.fn(async () => ({ inserted: 1, errors: [] })),
    removePrice: vi.fn(async (_storeId: string, _productId: string) => undefined),
  };
}

const req = { user: { sub: 'user-1', role: 'MANAGER', organizationId: 'org-1' } };

describe('StorePricesController', () => {
  it('list delega con el storeId y el actor derivado de req.user', async () => {
    const svc = makeService();
    const ctrl = new StorePricesController(svc as never);

    const res = await ctrl.list('store-1', req as never);

    expect(svc.list).toHaveBeenCalledWith('store-1', { userId: 'user-1', role: 'MANAGER' });
    expect(res).toEqual([{ id: 'sp-1', productId: 'p-1', price: '7.5' }]);
  });

  it('setPrice delega con storeId, DTO y actor', async () => {
    const svc = makeService();
    const ctrl = new StorePricesController(svc as never);
    const dto = { productId: 'p-1', price: 7.5 } as never;

    await ctrl.setPrice('store-1', dto, req as never);

    expect(svc.setPrice).toHaveBeenCalledWith('store-1', dto, {
      userId: 'user-1',
      role: 'MANAGER',
    });
  });

  it('importCsv delega con storeId, csv y actor', async () => {
    const svc = makeService();
    const ctrl = new StorePricesController(svc as never);

    const res = await ctrl.importCsv('store-1', { csv: 'sku,price\nA,1' } as never, req as never);

    expect(svc.importCsv).toHaveBeenCalledWith('store-1', 'sku,price\nA,1', {
      userId: 'user-1',
      role: 'MANAGER',
    });
    expect(res).toEqual({ inserted: 1, errors: [] });
  });

  it('removePrice delega con storeId, productId y actor', async () => {
    const svc = makeService();
    const ctrl = new StorePricesController(svc as never);

    await ctrl.removePrice('store-1', 'p-9', req as never);

    expect(svc.removePrice).toHaveBeenCalledWith('store-1', 'p-9', {
      userId: 'user-1',
      role: 'MANAGER',
    });
  });
});
