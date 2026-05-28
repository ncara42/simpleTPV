import type { NewUser, Store, StoreInput, User } from '@simpletpv/auth';

import { api } from './auth.js';

export type { NewUser, Store, StoreInput, User };

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
