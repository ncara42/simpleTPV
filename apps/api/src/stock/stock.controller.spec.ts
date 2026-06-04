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
    adjust: vi.fn(async (_input: unknown) => ({ quantity: 50, level: 'green' })),
    confirmInventoryCount: vi.fn(async (_input: unknown, _userId: string) => ({
      storeId: STORE,
      adjusted: [],
    })),
    movements: vi.fn(async (_opts: unknown) => ({
      items: [],
      totalItems: 0,
      page: 1,
      pageSize: 50,
    })),
    toReorder: vi.fn(async (_storeId: string) => [{ productId: PRODUCT, level: 'red' }]),
  } as unknown as StockService;
  return { controller: new StockController(service), service };
}

function req(): { user: { sub: string; organizationId: string; role: string } } {
  return { user: { sub: 'user-1', organizationId: 'org-1', role: 'ADMIN' } };
}

describe('StockController', () => {
  it('GET /stock delega el storeId en byStore', async () => {
    const { controller, service } = makeController();
    const res = (await controller.byStore(STORE, req())) as Array<{ level: string }>;
    expect(service.byStore).toHaveBeenCalledWith(STORE, 'user-1', 'ADMIN');
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

  it('POST /stock/adjust delega con el sub del usuario como userId', async () => {
    const { controller, service } = makeController();
    const res = (await controller.adjust(
      { productId: PRODUCT, storeId: STORE, newQuantity: 50, reason: 'recuento' },
      req(),
    )) as { quantity: number };
    expect(service.adjust).toHaveBeenCalledWith({
      productId: PRODUCT,
      storeId: STORE,
      newQuantity: 50,
      reason: 'recuento',
      userId: 'user-1',
    });
    expect(res.quantity).toBe(50);
  });

  it('POST /stock/inventory-count delega el body y el sub del usuario', async () => {
    const { controller, service } = makeController();
    const dto = {
      storeId: STORE,
      reason: 'Recuento',
      lines: [{ productId: PRODUCT, countedQuantity: 7 }],
    };

    const res = (await controller.confirmInventoryCount(dto, req())) as { storeId: string };

    expect(service.confirmInventoryCount).toHaveBeenCalledWith(dto, 'user-1');
    expect(res.storeId).toBe(STORE);
  });

  it('GET /stock/movements convierte fechas y números y delega los filtros', async () => {
    const { controller, service } = makeController();
    await controller.movements(PRODUCT, STORE, '2026-05-01', '2026-05-29', '2', '10');
    const arg = (service.movements as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![0] as { productId: string; from: Date; page: number };
    expect(arg.productId).toBe(PRODUCT);
    expect(arg.from).toBeInstanceOf(Date);
    expect(arg.page).toBe(2);
  });

  it('GET /stock/to-reorder delega el storeId en toReorder', async () => {
    const { controller, service } = makeController();
    const res = (await controller.toReorder(STORE, req())) as Array<{ level: string }>;
    expect(service.toReorder).toHaveBeenCalledWith(STORE, 'user-1', 'ADMIN');
    expect(res[0]!.level).toBe('red');
  });
});
