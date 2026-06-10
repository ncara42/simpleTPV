import type {
  ImportResult,
  NewUser,
  SalesPage,
  SalesQueryInput,
  SaleSummary,
  Store,
  StoreInput,
  UpdateUserInput,
  User,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { ImportResult, NewUser, SalesQueryInput, Store, StoreInput, UpdateUserInput, User };

export interface SalesViewRow extends SaleSummary {
  storeName: string;
  sellerId: string;
  sellerName: string;
  familyId: string;
  familyName: string;
  lines: number;
}

export interface SalesView extends Omit<SalesPage, 'items'> {
  items: SalesViewRow[];
}

export function listUsers(): Promise<User[]> {
  return api.get<User[]>('/users');
}

export function createUser(input: NewUser): Promise<User> {
  return api.post<User>('/users', input);
}

export function importUsersCsv(csv: string): Promise<ImportResult> {
  return api.post<ImportResult>('/users/import', { csv });
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return api.patch<User>(`/users/${id}`, input);
}

// Reemplaza las tiendas asignadas del usuario (PUT /users/:id/stores).
export function assignUserStores(id: string, storeIds: string[]): Promise<void> {
  return api.put<void>(`/users/${id}/stores`, { storeIds });
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

export function updateStore(id: string, input: Partial<StoreInput>): Promise<Store> {
  return api.patch<Store>(`/stores/${id}`, input);
}

export function deleteStore(id: string): Promise<void> {
  return api.del(`/stores/${id}`);
}

export async function listSales(params: SalesQueryInput): Promise<SalesView> {
  const { storeId, date, from, to, userId, familyId, status, q, page = 1, pageSize = 20 } = params;

  const res = await api.get<SalesPage>('/sales', {
    ...(storeId ? { storeId } : {}),
    ...(date ? { date } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(userId ? { userId } : {}),
    ...(familyId ? { familyId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });

  return {
    page: res.page,
    pageSize: res.pageSize,
    totalItems: res.totalItems,
    totals: res.totals,
    items: res.items.map((it) => ({
      ...it,
      storeName: (it as unknown as { store?: { name?: string } }).store?.name ?? '',
      sellerId: '',
      sellerName: (it as unknown as { user?: { name?: string } }).user?.name ?? '',
      familyId: '',
      familyName: '',
      lines: 0,
    })),
  };
}
