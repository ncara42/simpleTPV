import type { NewUser, SalesPage, SalesQueryInput, Store, StoreInput, User } from '@simpletpv/auth';

import { DEMO_SALES, DEMO_STORES, DEMO_USERS, type DemoSaleRow } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { NewUser, SalesQueryInput, Store, StoreInput, User };

// Página de ventas para la UI: misma forma que SalesPage pero con filas demo
// enriquecidas (vendedor/familia/tienda por nombre). En modo real (IT-09) los
// items serán SaleSummary con user/store anidados.
export interface SalesView extends Omit<SalesPage, 'items'> {
  items: DemoSaleRow[];
}

// Usuarios (IT-09): /users (solo ADMIN). createUser envía NewUser (incl. pin/password).
export function listUsers(): Promise<User[]> {
  if (isDemo()) return Promise.resolve(DEMO_USERS);
  return api.get<User[]>('/users');
}
export function createUser(input: NewUser): Promise<User> {
  if (isDemo()) {
    return Promise.resolve({
      id: `u-${input.email}`,
      name: input.name,
      email: input.email,
      role: input.role,
      active: true,
    });
  }
  return api.post<User>('/users', input);
}
export function deleteUser(id: string): Promise<void> {
  if (isDemo()) return Promise.resolve();
  return api.del(`/users/${id}`);
}

// Tiendas (IT-09): /stores (solo ADMIN).
export function listStores(): Promise<Store[]> {
  if (isDemo()) return Promise.resolve(DEMO_STORES);
  return api.get<Store[]>('/stores');
}
export function createStore(input: StoreInput): Promise<Store> {
  if (isDemo()) {
    return Promise.resolve({
      id: `s-${input.code}`,
      name: input.name,
      code: input.code,
      address: input.address ?? null,
      active: true,
    });
  }
  return api.post<Store>('/stores', input);
}
export function deleteStore(id: string): Promise<void> {
  if (isDemo()) return Promise.resolve();
  return api.del(`/stores/${id}`);
}

const DEFAULT_PAGE_SIZE = 20;

// Historial demo (#14 + IT-04): filtra por tienda/vendedor(userId)/familia/estado,
// conserva el orden por fecha desc de DEMO_SALES (como findSales) y pagina. `totals`
// agrega SOLO las COMPLETED; las tasas medias son valores demo plausibles (en modo
// real las calcula findSales). Misma forma de respuesta que la API real.
export function listSales(params: SalesQueryInput): Promise<SalesView> {
  const { storeId, userId, familyId, status, page = 1, pageSize = DEFAULT_PAGE_SIZE } = params;
  const all = DEMO_SALES.filter(
    (s) =>
      (!storeId || s.storeId === storeId) &&
      (!userId || s.sellerId === userId) &&
      (!familyId || s.familyId === familyId) &&
      (!status || s.status === status),
  );
  const completed = all.filter((s) => s.status !== 'VOIDED');
  const totalAmount = completed.reduce((acc, s) => acc + Number(s.total), 0);
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  return Promise.resolve({
    items,
    page,
    pageSize,
    totalItems: all.length,
    totals: {
      count: completed.length,
      totalAmount: totalAmount.toFixed(2),
      avgDiscountPct: 0.062,
      avgMarginPct: 0.41,
    },
  });
}
