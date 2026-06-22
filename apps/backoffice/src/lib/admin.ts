import type {
  ImportResult,
  NewUser,
  SalesPage,
  SalesQueryInput,
  SaleSummary,
  Store,
  StoreInput,
  StoreOpsInput,
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

// Estado operativo manual persistido (I-09): verificada + incidencia.
export function updateStoreOps(id: string, input: StoreOpsInput): Promise<Store> {
  return api.patch<Store>(`/stores/${id}/ops`, input);
}

// Designa (o desmarca) la tienda central de la organización (#146). Marcar una
// nueva desmarca la anterior en el backend (una sola central por organización).
export function setStoreCentral(id: string, isCentral: boolean): Promise<Store> {
  return api.patch<Store>(`/stores/${id}/central`, { isCentral });
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
    items: res.items.map((it) => {
      const row = it as unknown as {
        storeName?: string;
        sellerName?: string;
        store?: { name?: string };
        user?: { name?: string };
      };
      return {
        ...it,
        // El backend Rust sirve los nombres planos (storeName/sellerName); se conserva el
        // fallback a las relaciones anidadas (forma legacy NestJS) por compatibilidad.
        storeName: row.storeName ?? row.store?.name ?? '',
        sellerId: '',
        sellerName: row.sellerName ?? row.user?.name ?? '',
        familyId: '',
        familyName: '',
        lines: 0,
      };
    }),
  };
}
