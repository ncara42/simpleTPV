import type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  CustomerLedgerRow,
  PriceListDetail,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type {
  CreateWholesaleOrderInput,
  Customer,
  CustomerInput,
  CustomerLedgerRow,
  PriceListDetail,
  PriceListSummary,
  WholesaleOrderDetail,
  WholesaleOrdersPage,
  WholesaleOrderStatus,
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
