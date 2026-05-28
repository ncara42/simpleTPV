import { describe, expect, it, vi } from 'vitest';

import { StockController } from './stock.controller.js';
import type { StockService } from './stock.service.js';

const STORE = '22222222-2222-2222-2222-222222222222';
const PRODUCT = '33333333-3333-3333-3333-333333333333';

function makeController() {
  const service = {
    byStore: vi.fn(async (_storeId: string) => [{ productId: PRODUCT, level: 'green' }]),
    global: vi.fn(async () => [{ productId: PRODUCT, total: 10 }]),
    byProduct: vi.fn(async (_productId: string) => [{ storeId: STORE, quantity: 5 }]),
    alerts: vi.fn(async (_opts: unknown) => [{ id: 'a1', alertType: 'OUT_OF_STOCK' }]),
    setMin: vi.fn(async (_p: string, _s: string, _m: number) => ({ minStock: 5, level: 'yellow' })),
  } as unknown as StockService;
  return { controller: new StockController(service), service };
}

describe('StockController', () => {
  it('GET /stock delega el storeId en byStore', async () => {
    const { controller, service } = makeController();
    const res = (await controller.byStore(STORE)) as Array<{ level: string }>;
    expect(service.byStore).toHaveBeenCalledWith(STORE);
    expect(res[0]!.level).toBe('green');
  });

  it('GET /stock/global delega en global', async () => {
    const { controller, service } = makeController();
    const res = (await controller.global()) as Array<{ total: number }>;
    expect(service.global).toHaveBeenCalledOnce();
    expect(res[0]!.total).toBe(10);
  });

  it('GET /stock/product/:productId delega en byProduct', async () => {
    const { controller, service } = makeController();
    const res = (await controller.byProduct(PRODUCT)) as Array<{ quantity: number }>;
    expect(service.byProduct).toHaveBeenCalledWith(PRODUCT);
    expect(res[0]!.quantity).toBe(5);
  });

  it('GET /stock/alerts pasa storeId y resuelve resolved=true correctamente', async () => {
    const { controller, service } = makeController();
    await controller.alerts(STORE, 'true');
    expect(service.alerts).toHaveBeenCalledWith({ storeId: STORE, resolved: true });
  });

  it('GET /stock/alerts sin params: resolved=false y sin storeId', async () => {
    const { controller, service } = makeController();
    await controller.alerts(undefined, undefined);
    expect(service.alerts).toHaveBeenCalledWith({ resolved: false });
  });

  it('PUT /stock/min delega productId/storeId/minStock', async () => {
    const { controller, service } = makeController();
    const res = (await controller.setMin({
      productId: PRODUCT,
      storeId: STORE,
      minStock: 5,
    })) as { level: string };
    expect(service.setMin).toHaveBeenCalledWith(PRODUCT, STORE, 5);
    expect(res.level).toBe('yellow');
  });
});
