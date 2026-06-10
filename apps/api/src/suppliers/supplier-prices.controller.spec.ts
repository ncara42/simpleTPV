import { describe, expect, it, vi } from 'vitest';

import { SupplierPricesController } from './supplier-prices.controller.js';
import type { SupplierPricesService } from './supplier-prices.service.js';

const SUP = '11111111-1111-1111-1111-111111111111';
const PROD = '22222222-2222-2222-2222-222222222222';
const ROW = '33333333-3333-3333-3333-333333333333';

function makeController() {
  const service = {
    list: vi.fn(async () => [{ id: ROW, price: 3.5 }]),
    comparison: vi.fn(async () => [{ productId: PROD, prices: [] }]),
    upsert: vi.fn(async (dto: unknown) => ({ id: ROW, ...(dto as object) })),
    importCsv: vi.fn(async () => ({ inserted: 1, errors: [] })),
    remove: vi.fn(async (_id: string) => undefined),
  } as unknown as SupplierPricesService;
  return { controller: new SupplierPricesController(service), service };
}

describe('SupplierPricesController', () => {
  it('GET /supplier-prices delega los filtros en list', async () => {
    const { controller, service } = makeController();
    const res = await controller.list({ supplierId: SUP });
    expect(service.list).toHaveBeenCalledWith({ supplierId: SUP });
    expect(res[0]!.price).toBe(3.5);
  });

  it('GET /supplier-prices/comparison delega el familyId', async () => {
    const { controller, service } = makeController();
    await controller.comparison({ familyId: PROD });
    expect(service.comparison).toHaveBeenCalledWith(PROD);
  });

  it('PUT /supplier-prices delega el body en upsert', async () => {
    const { controller, service } = makeController();
    await controller.upsert({ supplierId: SUP, productId: PROD, price: 4.25 });
    expect(service.upsert).toHaveBeenCalledWith({ supplierId: SUP, productId: PROD, price: 4.25 });
  });

  it('POST /supplier-prices/import delega proveedor y csv', async () => {
    const { controller, service } = makeController();
    const res = await controller.importCsv({ supplierId: SUP, csv: 'sku,price\nA,1' });
    expect(service.importCsv).toHaveBeenCalledWith({ supplierId: SUP, csv: 'sku,price\nA,1' });
    expect(res.inserted).toBe(1);
  });

  it('DELETE /supplier-prices/:id delega en remove', async () => {
    const { controller, service } = makeController();
    await controller.remove(ROW);
    expect(service.remove).toHaveBeenCalledWith(ROW);
  });
});
