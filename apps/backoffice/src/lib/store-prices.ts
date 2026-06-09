import type { ImportResult, StorePriceOverride } from '@simpletpv/auth';

import { api } from './auth.js';

export type { ImportResult, StorePriceOverride };

export function listStorePrices(storeId: string): Promise<StorePriceOverride[]> {
  return api.get<StorePriceOverride[]>(`/stores/${storeId}/prices`);
}

export function setStorePrice(storeId: string, productId: string, price: number): Promise<void> {
  return api.put<void>(`/stores/${storeId}/prices`, { productId, price });
}

export function removeStorePrice(storeId: string, productId: string): Promise<void> {
  return api.del(`/stores/${storeId}/prices/${productId}`);
}

export function importStorePricesCsv(storeId: string, csv: string): Promise<ImportResult> {
  return api.post<ImportResult>(`/stores/${storeId}/prices/import`, { csv });
}
