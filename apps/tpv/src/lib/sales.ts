import {
  ApiError,
  type CreateSaleInput,
  type Sale,
  type SalesPage,
  type SalesQueryInput,
  type SaleTicket,
  type Store,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { Sale, SaleTicket, Store };

export function listStores(): Promise<Store[]> {
  return api.get<Store[]>('/me/stores');
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  return api.post<Sale>('/sales', { ...input, clientId: input.clientId ?? crypto.randomUUID() });
}

export function listSales(query: SalesQueryInput): Promise<SalesPage> {
  return api.get<SalesPage>('/sales', {
    ...(query.storeId ? { storeId: query.storeId } : {}),
    ...(query.date ? { date: query.date } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.page ? { page: String(query.page) } : {}),
    ...(query.pageSize ? { pageSize: String(query.pageSize) } : {}),
  });
}

export function getTicket(id: string): Promise<SaleTicket> {
  return api.get<SaleTicket>(`/sales/${id}/ticket`);
}

export async function getReceiptHtml(id: string): Promise<string> {
  const res = await api.fetch(`/sales/${id}/receipt`);
  if (!res.ok) {
    throw new ApiError(res.status, 'No se pudo generar la factura');
  }
  return res.text();
}

export function voidSale(id: string): Promise<Sale> {
  return api.post<Sale>(`/sales/${id}/void`, {});
}

export function findSaleByTicket(ticketNumber: string): Promise<Sale> {
  return api.get<Sale>(`/sales/by-ticket/${encodeURIComponent(ticketNumber)}`);
}
