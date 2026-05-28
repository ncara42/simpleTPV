import type { CreateSaleInput, Sale, SaleTicket, Store } from '@simpletpv/auth';

import { api } from './auth.js';

export type { Sale, SaleTicket, Store };

export function listStores(): Promise<Store[]> {
  // /me/stores: accesible a cualquier autenticado (incluido CLERK). /stores es
  // solo-ADMIN por diseño y daría 403 a los cajeros del TPV.
  return api.get<Store[]>('/me/stores');
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  return api.post<Sale>('/sales', input);
}

export function getTicket(id: string): Promise<SaleTicket> {
  return api.get<SaleTicket>(`/sales/${id}/ticket`);
}
