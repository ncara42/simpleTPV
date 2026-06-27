import type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  CustomerLedgerRow,
  PriceListDetail,
  PriceListItem,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
  WholesaleOrderSummary,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  CustomerLedgerRow,
  PriceListDetail,
  PriceListItem,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
  WholesaleOrderSummary,
};

export function listCustomers(): Promise<Customer[]> {
  return api.get<Customer[]>('/customers');
}

/** Agregado de cartera por cliente (saldo, vencido, facturado 12m, nº pedidos,
 *  último pedido). Se cruza con `listCustomers` por `customerId` en la vista. */
export function customerLedger(): Promise<CustomerLedgerRow[]> {
  return api.get<CustomerLedgerRow[]>('/customers/ledger');
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return api.post<Customer>('/customers', input);
}

export function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  return api.patch<Customer>(`/customers/${id}`, input);
}

export function deleteCustomer(id: string): Promise<void> {
  return api.del(`/customers/${id}`);
}

export function listPriceLists(): Promise<PriceListSummary[]> {
  return api.get<PriceListSummary[]>('/price-lists');
}

export function getPriceList(id: string): Promise<PriceListDetail | null> {
  return api.get<PriceListDetail>(`/price-lists/${id}`);
}

export function createPriceList(name: string): Promise<PriceListSummary> {
  return api.post<PriceListSummary>('/price-lists', { name });
}

// PATCH /price-lists/:id — renombra o activa/desactiva la tarifa. El backend
// (UpdatePriceList) acepta `name` y/o `active`; aplica COALESCE, así que omitir una
// clave la deja intacta. Devuelve el objeto base (id, name, active); la vista
// reconsulta `listPriceLists`/`getPriceList` para refrescar recuentos derivados.
export function updatePriceList(
  id: string,
  input: { name?: string; active?: boolean },
): Promise<{ id: string; name: string; active: boolean }> {
  return api.patch<{ id: string; name: string; active: boolean }>(`/price-lists/${id}`, input);
}

export function deletePriceList(id: string): Promise<void> {
  return api.del(`/price-lists/${id}`);
}

export function setPriceListItem(
  priceListId: string,
  productId: string,
  price: number,
): Promise<void> {
  return api.put<void>(`/price-lists/${priceListId}/items`, { productId, price });
}

export function removePriceListItem(priceListId: string, productId: string): Promise<void> {
  return api.del(`/price-lists/${priceListId}/items/${productId}`);
}

export function listWholesaleOrders(params: {
  status?: string;
  customerId?: string;
  page?: number;
}): Promise<WholesaleOrdersPage> {
  return api.get<WholesaleOrdersPage>('/wholesale-orders', {
    ...(params.status ? { status: params.status } : {}),
    ...(params.customerId ? { customerId: params.customerId } : {}),
    ...(params.page ? { page: String(params.page) } : {}),
  });
}

/** Trae TODOS los pedidos paginando hasta agotar (la pantalla de Pedidos los filtra en
 *  cliente por estado/periodo/tarifa, así que necesita el conjunto completo). El bucle
 *  está acotado por `totalItems` y por un tope de páginas defensivo. */
export async function listAllWholesaleOrders(): Promise<WholesaleOrderSummary[]> {
  const first = await listWholesaleOrders({ page: 1 });
  const all: WholesaleOrderSummary[] = [...first.items];
  const total = first.totalItems;
  const MAX_PAGES = 200;
  let page = 2;
  while (all.length < total && page <= MAX_PAGES) {
    const next = await listWholesaleOrders({ page });
    if (next.items.length === 0) break;
    all.push(...next.items);
    page += 1;
  }
  return all;
}

export function getWholesaleOrder(id: string): Promise<WholesaleOrderDetail | null> {
  return api.get<WholesaleOrderDetail>(`/wholesale-orders/${id}`);
}

export function createWholesaleOrder(
  input: CreateWholesaleOrderInput,
): Promise<WholesaleOrderDetail> {
  return api.post<WholesaleOrderDetail>('/wholesale-orders', input);
}

export function updateWholesaleOrderStatus(
  id: string,
  status: WholesaleOrderStatus,
): Promise<{ id: string; status: WholesaleOrderStatus }> {
  return api.patch<{ id: string; status: WholesaleOrderStatus }>(`/wholesale-orders/${id}/status`, {
    status,
  });
}

/** Registra el cobro de un pedido a crédito: lo marca PAID. Tesorería, no fiscal. */
export function collectWholesaleOrder(id: string): Promise<WholesaleOrderDetail> {
  return api.post<WholesaleOrderDetail>(`/wholesale-orders/${id}/collect`, {});
}
