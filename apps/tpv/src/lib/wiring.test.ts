import { ApiError } from '@simpletpv/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mockeamos el cliente HTTP real para verificar QUÉ endpoint llama cada lib.
// El data layer del TPV opera SIEMPRE contra el backend real (sin modo demo).
vi.mock('./auth.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  useAuthStore: { getState: () => ({ setTokens: vi.fn() }) },
}));

import { api } from './auth.js';
import * as cash from './cash.js';
import * as catalog from './catalog.js';
import * as sales from './sales.js';
import * as stock from './stock.js';
import * as storeOrders from './store-orders.js';
import * as timeClock from './time-clock.js';
import * as transfers from './transfers.js';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

describe('cableado API real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue([] as never);
    post.mockResolvedValue({} as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('catalog: endpoints correctos', async () => {
    await catalog.listFamilies();
    expect(get).toHaveBeenCalledWith('/product-families');
    await catalog.searchProducts('  cbd ', 'fam-1');
    expect(get).toHaveBeenCalledWith('/products', { search: 'cbd', familyId: 'fam-1' });
    await catalog.searchProducts('', null);
    expect(get).toHaveBeenLastCalledWith('/products', {});
  });

  it('catalog.findByBarcode devuelve null ante 404', async () => {
    get.mockResolvedValueOnce({ id: 'p1' } as never);
    expect(await catalog.findByBarcode('8400000000031')).toEqual({ id: 'p1' });
    expect(get).toHaveBeenCalledWith('/products/barcode/8400000000031');
    get.mockRejectedValueOnce(new ApiError(404, 'no encontrado'));
    expect(await catalog.findByBarcode('0000')).toBeNull();
  });

  it('stock: endpoints correctos', async () => {
    await stock.getStoreStock('store-1');
    expect(get).toHaveBeenCalledWith('/stock', { storeId: 'store-1' });
    await stock.getProductStock('prod-1');
    expect(get).toHaveBeenCalledWith('/stock/product/prod-1');
    await stock.confirmInventoryCount({
      storeId: 'store-1',
      reason: 'Recuento',
      lines: [{ productId: 'prod-1', countedQuantity: 3 }],
    });
    expect(post).toHaveBeenCalledWith('/stock/inventory-count', {
      storeId: 'store-1',
      reason: 'Recuento',
      lines: [{ productId: 'prod-1', countedQuantity: 3 }],
    });
  });

  it('cash: endpoints correctos + 404 → null', async () => {
    await cash.openCashSession({ storeId: 'store-1', openingAmount: 100 });
    expect(post).toHaveBeenCalledWith('/cash-sessions/open', {
      storeId: 'store-1',
      openingAmount: 100,
    });
    await cash.closeCashSession('cs-1', 250);
    expect(post).toHaveBeenCalledWith('/cash-sessions/cs-1/close', { countedAmount: 250 });
    await cash.currentCashSession('store-1');
    expect(get).toHaveBeenCalledWith('/cash-sessions/current', { storeId: 'store-1' });
    get.mockRejectedValueOnce(new ApiError(404, 'sin caja'));
    expect(await cash.currentCashSession('store-1')).toBeNull();
    await cash.listCashMovements('cs-1');
    expect(get).toHaveBeenCalledWith('/cash-sessions/cs-1/movements');
    await cash.createCashMovement('cs-1', { type: 'OUT', amount: 25, reason: 'Retirada' });
    expect(post).toHaveBeenCalledWith('/cash-sessions/cs-1/movements', {
      type: 'OUT',
      amount: 25,
      reason: 'Retirada',
    });
  });

  it('sales: endpoints correctos', async () => {
    await sales.listStores();
    expect(get).toHaveBeenCalledWith('/me/stores');
    const input = {
      storeId: 's1',
      lines: [{ productId: 'p1', qty: 1 }],
      paymentMethod: 'CASH' as const,
    };
    await sales.createSale(input);
    // createSale añade un clientId (idempotencia de reintentos); el resto del
    // payload debe ir tal cual.
    expect(post).toHaveBeenCalledWith('/sales', expect.objectContaining(input));
    await sales.getTicket('sale-1');
    expect(get).toHaveBeenCalledWith('/sales/sale-1/ticket');
    await sales.voidSale('sale-1');
    expect(post).toHaveBeenCalledWith('/sales/sale-1/void', {});
    await sales.findSaleByTicket('T01-000007');
    expect(get).toHaveBeenCalledWith('/sales/by-ticket/T01-000007');
    await sales.listSales({ storeId: 's1', q: 'T01', page: 2, pageSize: 10 });
    expect(get).toHaveBeenCalledWith('/sales', {
      storeId: 's1',
      q: 'T01',
      page: '2',
      pageSize: '10',
    });
  });

  it('store-orders: lista SENT filtrando por tienda destino y recibe', async () => {
    get.mockResolvedValueOnce([
      { id: 'o1', destStoreId: 'store-1', lines: [] },
      { id: 'o2', destStoreId: 'store-2', lines: [] },
    ] as never);
    const incoming = await storeOrders.listIncomingStoreOrders('store-1');
    expect(get).toHaveBeenCalledWith('/store-orders', { status: 'SENT' });
    expect(incoming.map((t) => t.id)).toEqual(['o1']);
    post.mockResolvedValueOnce({ id: 'o1', destStoreId: 'store-1', lines: [] } as never);
    await storeOrders.receiveStoreOrder('o1', { lines: [] });
    expect(post).toHaveBeenCalledWith('/store-orders/o1/receive', { lines: [] });
  });

  it('time-clock: endpoints correctos', async () => {
    await timeClock.currentDevice();
    expect(get).toHaveBeenCalledWith('/devices/current', {});
    await timeClock.pairDevice('TOKEN123');
    expect(post).toHaveBeenCalledWith('/devices/pair', { pairingToken: 'TOKEN123' });
    await timeClock.currentTimeClock('store-1');
    expect(get).toHaveBeenCalledWith('/time-clock/current', { storeId: 'store-1' });
    await timeClock.createTimeClockEntry({
      storeId: 'store-1',
      deviceId: 'device-1',
      type: 'CLOCK_IN',
    });
    expect(post).toHaveBeenCalledWith('/time-clock', {
      storeId: 'store-1',
      deviceId: 'device-1',
      type: 'CLOCK_IN',
    });
    await timeClock.createOfficialDevice({ storeId: 'store-1', name: 'TPV Mostrador' });
    expect(post).toHaveBeenCalledWith('/devices', { storeId: 'store-1', name: 'TPV Mostrador' });
  });

  it('transfers: lista SENT filtrando por tienda destino y recibe', async () => {
    get.mockResolvedValueOnce([
      { id: 't1', destStoreId: 'store-1' },
      { id: 't2', destStoreId: 'store-2' },
    ] as never);
    const incoming = await transfers.listIncomingTransfers('store-1');
    expect(get).toHaveBeenCalledWith('/transfers', { status: 'SENT' });
    expect(incoming.map((t) => t.id)).toEqual(['t1']);
    await transfers.receiveTransfer('t1', { lines: [] });
    expect(post).toHaveBeenCalledWith('/transfers/t1/receive', { lines: [] });
  });
});
