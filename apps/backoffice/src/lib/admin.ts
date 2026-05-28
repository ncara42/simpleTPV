import type { NewUser, SalesPage, Store, StoreInput, User } from '@simpletpv/auth';

import { api } from './auth.js';

export type { NewUser, SalesPage, Store, StoreInput, User };

export function listUsers(): Promise<User[]> {
  return api.get<User[]>('/users');
}

export function createUser(input: NewUser): Promise<User> {
  return api.post<User>('/users', input);
}

export function deleteUser(id: string): Promise<void> {
  return api.del(`/users/${id}`);
}

export function listStores(): Promise<Store[]> {
  return api.get<Store[]>('/stores');
}

export function createStore(input: StoreInput): Promise<Store> {
  return api.post<Store>('/stores', input);
}

export function deleteStore(id: string): Promise<void> {
  return api.del(`/stores/${id}`);
}

// Historial de ventas paginado (#14). storeId/date opcionales filtran por tienda
// y día (YYYY-MM-DD). El cliente omite los params vacíos del querystring.
export function listSales(params: {
  storeId?: string;
  date?: string;
  page?: number;
}): Promise<SalesPage> {
  return api.get<SalesPage>('/sales', {
    storeId: params.storeId,
    date: params.date,
    page: params.page != null ? String(params.page) : undefined,
  });
}
