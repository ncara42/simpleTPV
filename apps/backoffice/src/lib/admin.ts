import type { NewUser, SalesPage, Store, StoreInput, User } from '@simpletpv/auth';

import { DEMO_SALES_PAGE, DEMO_STORES, DEMO_USERS } from '../demo/demoData.js';

export type { NewUser, SalesPage, Store, StoreInput, User };

export function listUsers(): Promise<User[]> {
  return Promise.resolve(DEMO_USERS);
}
export function createUser(input: NewUser): Promise<User> {
  return Promise.resolve({
    id: `u-${input.email}`,
    name: input.name,
    email: input.email,
    role: input.role,
    active: true,
  });
}
export function deleteUser(_id: string): Promise<void> {
  return Promise.resolve();
}

export function listStores(): Promise<Store[]> {
  return Promise.resolve(DEMO_STORES);
}
export function createStore(input: StoreInput): Promise<Store> {
  return Promise.resolve({
    id: `s-${input.code}`,
    name: input.name,
    code: input.code,
    address: input.address ?? null,
    active: true,
  });
}
export function deleteStore(_id: string): Promise<void> {
  return Promise.resolve();
}

export function listSales(_params: {
  storeId?: string;
  date?: string;
  page?: number;
}): Promise<SalesPage> {
  return Promise.resolve(DEMO_SALES_PAGE);
}
