import type { CreateSaleInput, Sale, Store } from '@simpletpv/auth';

import { api } from './auth.js';

export type { Sale, Store };

export function listStores(): Promise<Store[]> {
  return api.get<Store[]>('/stores');
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  return api.post<Sale>('/sales', input);
}
