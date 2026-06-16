import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mockeamos el cliente HTTP real para verificar QUÉ endpoint llama cada lib del
// backoffice (IT-09). El data layer opera SIEMPRE contra el backend real (sin demo).
vi.mock('./auth.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import * as admin from './admin.js';
import { api } from './auth.js';
import * as cash from './cash.js';
import * as dashboard from './dashboard.js';
import * as families from './families.js';
import * as features from './features.js';
import { getPreferences, setPreference } from './preferences.js';
import * as products from './products.js';
import * as promotions from './promotions.js';
import * as purchases from './purchases.js';
import * as stock from './stock.js';
import * as storePrices from './store-prices.js';
import * as timeClock from './time-clock.js';
import * as verifactu from './verifactu.js';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const put = vi.mocked(api.put);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.del);

describe('cableado API real del backoffice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue([] as never);
    post.mockResolvedValue({} as never);
    put.mockResolvedValue({} as never);
    patch.mockResolvedValue({} as never);
    del.mockResolvedValue(undefined as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('families: endpoints /product-families', async () => {
    await families.listFamilies();
    expect(get).toHaveBeenCalledWith('/product-families');
    await families.createFamily({ name: 'Nueva' } as never);
    expect(post).toHaveBeenCalledWith('/product-families', { name: 'Nueva' });
    await families.updateFamily('fam-1', { name: 'X' });
    expect(patch).toHaveBeenCalledWith('/product-families/fam-1', { name: 'X' });
    await families.deleteFamily('fam-1');
    expect(del).toHaveBeenCalledWith('/product-families/fam-1');
  });

  it('products: endpoints /products', async () => {
    await products.listProducts('  cbd ');
    expect(get).toHaveBeenCalledWith('/products', { search: 'cbd' });
    await products.listProducts('');
    expect(get).toHaveBeenLastCalledWith('/products', {});
    await products.createProduct({ name: 'P', salePrice: 10 } as never);
    expect(post).toHaveBeenCalledWith('/products', { name: 'P', salePrice: 10 });
    await products.updateProduct('p-1', { name: 'Q' });
    expect(patch).toHaveBeenCalledWith('/products/p-1', { name: 'Q' });
    await products.deleteProduct('p-1');
    expect(del).toHaveBeenCalledWith('/products/p-1');
  });

  it('admin: usuarios y tiendas', async () => {
    await admin.listUsers();
    expect(get).toHaveBeenCalledWith('/users');
    await admin.createUser({ name: 'Ana', email: 'a@b.test', role: 'MANAGER' } as never);
    expect(post).toHaveBeenCalledWith('/users', {
      name: 'Ana',
      email: 'a@b.test',
      role: 'MANAGER',
    });
    await admin.deleteUser('u-1');
    expect(del).toHaveBeenCalledWith('/users/u-1');

    await admin.listStores();
    expect(get).toHaveBeenCalledWith('/stores');
    await admin.createStore({ name: 'Centro', code: '01' } as never);
    expect(post).toHaveBeenCalledWith('/stores', { name: 'Centro', code: '01' });
    await admin.deleteStore('s-1');
    expect(del).toHaveBeenCalledWith('/stores/s-1');
    await admin.setStoreCentral('s-1', true);
    expect(patch).toHaveBeenCalledWith('/stores/s-1/central', { isCentral: true });
  });

  it('cash: aprobaciones de movimientos (#146)', async () => {
    await cash.listPendingCashMovements();
    expect(get).toHaveBeenCalledWith('/cash-sessions/movements/pending');
    await cash.approveCashMovement('cm-1');
    expect(post).toHaveBeenCalledWith('/cash-sessions/movements/cm-1/approve', {});
    await cash.denyCashMovement('cm-1');
    expect(post).toHaveBeenCalledWith('/cash-sessions/movements/cm-1/deny', {});
  });

  it('sales: GET /sales con filtros y mapea user/store anidados a planos', async () => {
    get.mockResolvedValueOnce({
      items: [
        {
          id: 's1',
          ticketNumber: 'T01-000001',
          createdAt: '2026-06-02T10:00:00.000Z',
          total: '10.00',
          paymentMethod: 'CASH',
          status: 'COMPLETED',
          storeId: 'st1',
          user: { name: 'Marta Ruiz' },
          store: { name: 'Centro', code: '01' },
        },
      ],
      page: 2,
      pageSize: 10,
      totalItems: 1,
      totals: { count: 1, totalAmount: '10.00', avgDiscountPct: 0.05, avgMarginPct: 0.4 },
    } as never);

    const res = await admin.listSales({
      storeId: 'st1',
      userId: 'u-marta',
      status: 'COMPLETED',
      page: 2,
      pageSize: 10,
    });

    // page/pageSize viajan como string; solo los filtros activos.
    expect(get).toHaveBeenCalledWith('/sales', {
      storeId: 'st1',
      userId: 'u-marta',
      status: 'COMPLETED',
      page: '2',
      pageSize: '10',
    });
    // El item anidado se aplana para el DataTable.
    expect(res.items[0]!.sellerName).toBe('Marta Ruiz');
    expect(res.items[0]!.storeName).toBe('Centro');
    expect(res.totals.avgMarginPct).toBe(0.4);
  });

  it('dashboard: endpoints /dashboard/* con period y storeId', async () => {
    await dashboard.getSalesToday('st1');
    expect(get).toHaveBeenCalledWith('/dashboard/sales-today', { storeId: 'st1' });
    await dashboard.getSalesByFamily('week', 'st1');
    expect(get).toHaveBeenCalledWith('/dashboard/sales-by-family', {
      period: 'week',
      storeId: 'st1',
    });
    await dashboard.getSalesKpis('month');
    expect(get).toHaveBeenCalledWith('/dashboard/sales-kpis', { period: 'month' });
    await dashboard.getMarginKpis('today', 'st1');
    expect(get).toHaveBeenCalledWith('/dashboard/margin-kpis', { period: 'today', storeId: 'st1' });
    await dashboard.getStockoutKpis('week');
    expect(get).toHaveBeenCalledWith('/dashboard/stockout-kpis', { period: 'week' });
    await dashboard.getProductRankings('yesterday', 'st1');
    expect(get).toHaveBeenCalledWith('/dashboard/product-rankings', {
      period: 'yesterday',
      storeId: 'st1',
    });
  });

  it('stock: global/alerts/min/movements/adjust y traspasos', async () => {
    await stock.getGlobalStock();
    expect(get).toHaveBeenCalledWith('/stock/global');
    await stock.listAlerts('st1');
    expect(get).toHaveBeenCalledWith('/stock/alerts', { storeId: 'st1' });
    await stock.listExpiringBatches('st1');
    expect(get).toHaveBeenCalledWith('/stock/expiring', { storeId: 'st1' });
    await stock.listExpiringBatches();
    expect(get).toHaveBeenLastCalledWith('/stock/expiring', {});
    await stock.setMinStock({ productId: 'p1', storeId: 'st1', minStock: 5 } as never);
    expect(put).toHaveBeenCalledWith('/stock/min', {
      productId: 'p1',
      storeId: 'st1',
      minStock: 5,
    });
    await stock.listMovements('p1');
    expect(get).toHaveBeenCalledWith('/stock/movements', { productId: 'p1' });
    await stock.adjustStock({ productId: 'p1', storeId: 'st1', newQuantity: 3, reason: 'r' });
    expect(post).toHaveBeenCalledWith('/stock/adjust', {
      productId: 'p1',
      storeId: 'st1',
      newQuantity: 3,
      reason: 'r',
    });
    await stock.listTransfers('SENT');
    expect(get).toHaveBeenCalledWith('/transfers', { status: 'SENT' });
    await stock.createTransfer({ originStoreId: 'a', destStoreId: 'b', lines: [] } as never);
    expect(post).toHaveBeenCalledWith('/transfers', {
      originStoreId: 'a',
      destStoreId: 'b',
      lines: [],
    });
    await stock.sendTransfer('t1');
    expect(post).toHaveBeenCalledWith('/transfers/t1/send');
  });

  it('features: GET /me/features con storeId opcional (#127 B)', async () => {
    await features.getFeatures('st1');
    expect(get).toHaveBeenCalledWith('/me/features', { storeId: 'st1' });
    await features.getFeatures();
    expect(get).toHaveBeenLastCalledWith('/me/features', {});
  });

  it('store-prices: overrides retail por tienda contra /stores/:id/prices', async () => {
    await storePrices.listStorePrices('st1');
    expect(get).toHaveBeenCalledWith('/stores/st1/prices');
    await storePrices.setStorePrice('st1', 'p1', 7.5);
    expect(put).toHaveBeenCalledWith('/stores/st1/prices', { productId: 'p1', price: 7.5 });
    await storePrices.removeStorePrice('st1', 'p1');
    expect(del).toHaveBeenCalledWith('/stores/st1/prices/p1');
  });

  it('purchases: pedidos de compra contra /purchase-orders', async () => {
    await purchases.listPurchaseOrders('DRAFT');
    expect(get).toHaveBeenCalledWith('/purchase-orders', { status: 'DRAFT' });
    await purchases.getPurchaseOrder('po-1');
    expect(get).toHaveBeenCalledWith('/purchase-orders/po-1');
    await purchases.createPurchaseOrder({ supplierId: 's', storeId: 'st', lines: [] } as never);
    expect(post).toHaveBeenCalledWith('/purchase-orders', {
      supplierId: 's',
      storeId: 'st',
      lines: [],
    });
    await purchases.confirmPurchaseOrder('po-1');
    expect(post).toHaveBeenCalledWith('/purchase-orders/po-1/confirm');
    await purchases.receivePurchaseOrder('po-1', { lines: [] } as never);
    expect(post).toHaveBeenCalledWith('/purchase-orders/po-1/receive', { lines: [] });
    await purchases.suggestPurchase({ storeId: 'st' } as never);
    expect(post).toHaveBeenCalledWith('/purchase-orders/suggest', { storeId: 'st' });
  });

  it('preferences: GET /me/preferences y PUT /me/preferences/:key', async () => {
    await getPreferences();
    expect(get).toHaveBeenCalledWith('/me/preferences');
    await setPreference('dashboard.cards', { hidden: ['kpi-upt'] });
    expect(put).toHaveBeenCalledWith('/me/preferences/dashboard.cards', {
      value: { hidden: ['kpi-upt'] },
    });
  });

  it('promotions: CRUD contra /promotions (#99)', async () => {
    await promotions.listPromotions();
    expect(get).toHaveBeenCalledWith('/promotions');
    await promotions.createPromotion({
      name: '3x2',
      conditionType: 'min_qty',
      threshold: 3,
      discountType: 'percent',
      discountValue: 33,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(post).toHaveBeenCalledWith('/promotions', expect.objectContaining({ name: '3x2' }));
    await promotions.updatePromotion('promo-1', { active: false });
    expect(patch).toHaveBeenCalledWith('/promotions/promo-1', { active: false });
    await promotions.deletePromotion('promo-1');
    expect(del).toHaveBeenCalledWith('/promotions/promo-1');
  });

  it('time-clock: log de tienda contra /time-clock/entries (Fase C)', async () => {
    get.mockResolvedValueOnce([
      {
        id: 'e1',
        userId: 'u1',
        userName: 'Marta',
        type: 'CLOCK_IN',
        createdAt: '2026-06-04T08:00:00.000Z',
      },
      {
        id: 'e2',
        userId: 'u1',
        userName: 'Marta',
        type: 'BREAK_START',
        createdAt: '2026-06-04T10:00:00.000Z',
      },
      {
        id: 'e3',
        userId: 'u1',
        userName: 'Marta',
        type: 'CLOCK_OUT',
        createdAt: '2026-06-04T16:00:00.000Z',
      },
    ] as never);

    const log = await timeClock.listStoreLog('st1');

    expect(get).toHaveBeenCalledWith('/time-clock/entries', { storeId: 'st1' });
    // Filtra pausas; mapea CLOCK_IN→apertura / CLOCK_OUT→cierre con fecha/hora locales.
    expect(log).toEqual([
      { name: 'Marta', date: '2026-06-04', time: '08:00', type: 'apertura' },
      { name: 'Marta', date: '2026-06-04', time: '16:00', type: 'cierre' },
    ]);
  });

  it('time-clock: histórico cross-tienda contra /time-clock/history-all (Fase D)', async () => {
    await timeClock.listHistoryAll();
    expect(get).toHaveBeenCalledWith('/time-clock/history-all', {});
    await timeClock.listHistoryAll({
      storeId: 'st1',
      userId: 'u1',
      from: '2026-06-01',
      to: '2026-06-02',
    });
    expect(get).toHaveBeenLastCalledWith('/time-clock/history-all', {
      storeId: 'st1',
      userId: 'u1',
      from: '2026-06-01',
      to: '2026-06-02',
    });
  });

  it('verifactu: registros contra /verifactu/records con estado opcional (Fase D)', async () => {
    await verifactu.listVerifactuRecords();
    expect(get).toHaveBeenCalledWith('/verifactu/records', {});
    await verifactu.listVerifactuRecords('FAILED');
    expect(get).toHaveBeenLastCalledWith('/verifactu/records', { status: 'FAILED' });
  });
});
