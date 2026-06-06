import type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  PriceListDetail,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
} from '@simpletpv/auth';

import { DEMO_PRODUCTS } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  PriceListDetail,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
};

// ── Estado demo (mutable en memoria durante la sesión) ───────────────────────
// Las funciones demo mutan estos arrays in-place; con invalidateQueries la UI
// re-lee y refleja los cambios, dando una demo funcional sin backend.
const demoPriceLists: PriceListSummary[] = [
  { id: 'pl-mayorista', name: 'Mayorista general', active: true, itemCount: 3, customerCount: 1 },
  {
    id: 'pl-distribuidor',
    name: 'Distribuidor premium',
    active: true,
    itemCount: 1,
    customerCount: 1,
  },
];

const demoPriceListItems: Record<string, PriceListDetail['items']> = {
  'pl-mayorista': [
    {
      id: 'pli-1',
      productId: 'p-aceite-cbd-10',
      price: '18.50',
      product: { name: 'Aceite CBD 10%', salePrice: '24.90' },
    },
    {
      id: 'pli-2',
      productId: 'p-flor-lemon-haze',
      price: '10.90',
      product: { name: 'Flor Lemon Haze 2g', salePrice: '14.50' },
    },
    {
      id: 'pli-3',
      productId: 'p-vapeador-pro',
      price: '29.00',
      product: { name: 'Vapeador Pro', salePrice: '39.00' },
    },
  ],
  'pl-distribuidor': [
    {
      id: 'pli-4',
      productId: 'p-aceite-full',
      price: '25.00',
      product: { name: 'Aceite full spectrum', salePrice: '34.00' },
    },
  ],
};

const demoCustomers: Customer[] = [
  {
    id: 'cust-herbolario',
    name: 'Herbolario Las Flores',
    nif: 'B73111222',
    email: 'compras@lasflores.example',
    phone: '968 11 22 33',
    address: 'C/ Mayor 14, Murcia',
    priceListId: 'pl-mayorista',
    active: true,
    priceList: { id: 'pl-mayorista', name: 'Mayorista general' },
  },
  {
    id: 'cust-growshop',
    name: 'GrowShop Levante',
    nif: 'B30444555',
    email: 'pedidos@growlevante.example',
    phone: '966 44 55 66',
    address: 'Av. Libertad 8, Alicante',
    priceListId: 'pl-distribuidor',
    active: true,
    priceList: { id: 'pl-distribuidor', name: 'Distribuidor premium' },
  },
];

let demoOrderSeq = 0;
const demoOrders: WholesaleOrderDetail[] = [
  {
    id: 'wo-1001',
    customerId: 'cust-herbolario',
    status: 'CONFIRMED',
    total: '76.00',
    notes: null,
    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    customer: { name: 'Herbolario Las Flores', nif: 'B73111222' },
    lines: [
      {
        id: 'wol-1',
        productId: 'p-aceite-cbd-10',
        qty: '4',
        unitPrice: '18.50',
        lineTotal: '74.00',
        product: { name: 'Aceite CBD 10%' },
      },
    ],
  },
];

const round2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

// ── Clientes ─────────────────────────────────────────────────────────────────
export function listCustomers(): Promise<Customer[]> {
  if (isDemo()) return Promise.resolve(demoCustomers.map((c) => ({ ...c })));
  return api.get<Customer[]>('/customers');
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  if (isDemo()) {
    const pl = demoPriceLists.find((p) => p.id === input.priceListId);
    const c: Customer = {
      id: `cust-${Date.now()}`,
      name: input.name,
      nif: input.nif ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      priceListId: input.priceListId ?? null,
      active: true,
      priceList: pl ? { id: pl.id, name: pl.name } : null,
    };
    demoCustomers.push(c);
    return Promise.resolve(c);
  }
  return api.post<Customer>('/customers', input);
}

export function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  if (isDemo()) {
    const c = demoCustomers.find((x) => x.id === id);
    if (c) {
      Object.assign(c, input);
      const pl = demoPriceLists.find((p) => p.id === c.priceListId);
      c.priceList = pl ? { id: pl.id, name: pl.name } : null;
    }
    return Promise.resolve(c as Customer);
  }
  return api.patch<Customer>(`/customers/${id}`, input);
}

export function deleteCustomer(id: string): Promise<void> {
  if (isDemo()) {
    const i = demoCustomers.findIndex((x) => x.id === id);
    if (i >= 0) demoCustomers.splice(i, 1);
    return Promise.resolve();
  }
  return api.del(`/customers/${id}`);
}

// ── Tarifas ──────────────────────────────────────────────────────────────────
export function listPriceLists(): Promise<PriceListSummary[]> {
  if (isDemo()) return Promise.resolve(demoPriceLists.map((p) => ({ ...p })));
  return api.get<PriceListSummary[]>('/price-lists');
}

export function getPriceList(id: string): Promise<PriceListDetail | null> {
  if (isDemo()) {
    const pl = demoPriceLists.find((p) => p.id === id);
    if (!pl) return Promise.resolve(null);
    return Promise.resolve({
      id: pl.id,
      name: pl.name,
      active: pl.active,
      items: (demoPriceListItems[id] ?? []).map((it) => ({ ...it })),
    });
  }
  return api.get<PriceListDetail>(`/price-lists/${id}`);
}

export function createPriceList(name: string): Promise<PriceListSummary> {
  if (isDemo()) {
    const pl: PriceListSummary = {
      id: `pl-${Date.now()}`,
      name,
      active: true,
      itemCount: 0,
      customerCount: 0,
    };
    demoPriceLists.push(pl);
    demoPriceListItems[pl.id] = [];
    return Promise.resolve(pl);
  }
  return api.post<PriceListSummary>('/price-lists', { name });
}

export function deletePriceList(id: string): Promise<void> {
  if (isDemo()) {
    const i = demoPriceLists.findIndex((p) => p.id === id);
    if (i >= 0) demoPriceLists.splice(i, 1);
    delete demoPriceListItems[id];
    return Promise.resolve();
  }
  return api.del(`/price-lists/${id}`);
}

export function setPriceListItem(
  priceListId: string,
  productId: string,
  price: number,
): Promise<void> {
  if (isDemo()) {
    const items = (demoPriceListItems[priceListId] ??= []);
    const prod = DEMO_PRODUCTS.find((p) => p.id === productId);
    const existing = items.find((it) => it.productId === productId);
    if (existing) {
      existing.price = price.toFixed(2);
    } else {
      items.push({
        id: `pli-${Date.now()}`,
        productId,
        price: price.toFixed(2),
        product: { name: prod?.name ?? productId, salePrice: prod?.salePrice ?? '0' },
      });
    }
    const pl = demoPriceLists.find((p) => p.id === priceListId);
    if (pl) pl.itemCount = items.length;
    return Promise.resolve();
  }
  return api.put<void>(`/price-lists/${priceListId}/items`, { productId, price });
}

export function removePriceListItem(priceListId: string, productId: string): Promise<void> {
  if (isDemo()) {
    const items = demoPriceListItems[priceListId] ?? [];
    const i = items.findIndex((it) => it.productId === productId);
    if (i >= 0) items.splice(i, 1);
    const pl = demoPriceLists.find((p) => p.id === priceListId);
    if (pl) pl.itemCount = items.length;
    return Promise.resolve();
  }
  return api.del(`/price-lists/${priceListId}/items/${productId}`);
}

// ── Pedidos mayoristas ───────────────────────────────────────────────────────
export function listWholesaleOrders(params: {
  status?: string;
  page?: number;
}): Promise<WholesaleOrdersPage> {
  if (isDemo()) {
    const filtered = params.status
      ? demoOrders.filter((o) => o.status === params.status)
      : demoOrders;
    return Promise.resolve({
      items: filtered.map((o) => ({
        id: o.id,
        customerId: o.customerId,
        customerName: o.customer.name,
        status: o.status,
        total: o.total,
        lineCount: o.lines.length,
        createdAt: o.createdAt,
      })),
      page: 1,
      pageSize: 20,
      totalItems: filtered.length,
    });
  }
  return api.get<WholesaleOrdersPage>('/wholesale-orders', {
    ...(params.status ? { status: params.status } : {}),
    ...(params.page ? { page: String(params.page) } : {}),
  });
}

export function getWholesaleOrder(id: string): Promise<WholesaleOrderDetail | null> {
  if (isDemo()) {
    return Promise.resolve(demoOrders.find((o) => o.id === id) ?? null);
  }
  return api.get<WholesaleOrderDetail>(`/wholesale-orders/${id}`);
}

export function createWholesaleOrder(
  input: CreateWholesaleOrderInput,
): Promise<WholesaleOrderDetail> {
  if (isDemo()) {
    const cust = demoCustomers.find((c) => c.id === input.customerId);
    const tariff = cust?.priceListId ? (demoPriceListItems[cust.priceListId] ?? []) : [];
    let total = 0;
    const lines = input.lines.map((l, idx) => {
      const prod = DEMO_PRODUCTS.find((p) => p.id === l.productId);
      const tItem = tariff.find((it) => it.productId === l.productId);
      const unit = tItem ? Number(tItem.price) : Number(prod?.salePrice ?? 0);
      const lineTotal = unit * l.qty;
      total += lineTotal;
      return {
        id: `wol-${Date.now()}-${idx}`,
        productId: l.productId,
        qty: String(l.qty),
        unitPrice: round2(unit),
        lineTotal: round2(lineTotal),
        product: { name: prod?.name ?? l.productId },
      };
    });
    const order: WholesaleOrderDetail = {
      id: `wo-${1002 + demoOrderSeq++}`,
      customerId: input.customerId,
      status: 'DRAFT',
      total: round2(total),
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      customer: { name: cust?.name ?? '—', nif: cust?.nif ?? null },
      lines,
    };
    demoOrders.unshift(order);
    return Promise.resolve(order);
  }
  return api.post<WholesaleOrderDetail>('/wholesale-orders', input);
}

export function updateWholesaleOrderStatus(
  id: string,
  status: WholesaleOrderStatus,
): Promise<{ id: string; status: WholesaleOrderStatus }> {
  if (isDemo()) {
    const o = demoOrders.find((x) => x.id === id);
    if (o) o.status = status;
    return Promise.resolve({ id, status });
  }
  return api.patch<{ id: string; status: WholesaleOrderStatus }>(`/wholesale-orders/${id}/status`, {
    status,
  });
}
