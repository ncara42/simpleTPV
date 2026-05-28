import { api } from './auth.js';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'CLERK';
  active: boolean;
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: 'ADMIN' | 'MANAGER' | 'CLERK';
}

export interface StoreRow {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

async function json<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) throw new Error(`Error ${res.status} ${action}`);
  return (await res.json()) as T;
}

export const usersApi = {
  list: async (): Promise<UserRow[]> => json(await api.fetch('/users'), 'listando usuarios'),
  create: async (u: NewUser): Promise<UserRow> =>
    json(
      await api.fetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u),
      }),
      'creando usuario',
    ),
  remove: async (id: string): Promise<void> => {
    const res = await api.fetch(`/users/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Error ${res.status} borrando usuario`);
  },
};

export const storesApi = {
  list: async (): Promise<StoreRow[]> => json(await api.fetch('/stores'), 'listando tiendas'),
  create: async (s: { name: string; address?: string }): Promise<StoreRow> =>
    json(
      await api.fetch('/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      }),
      'creando tienda',
    ),
  remove: async (id: string): Promise<void> => {
    const res = await api.fetch(`/stores/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Error ${res.status} borrando tienda`);
  },
};
