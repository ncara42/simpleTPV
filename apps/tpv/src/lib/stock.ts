import type { ConfirmInventoryCountInput, StockByProductRow, StockRow } from '@simpletpv/auth';

import { api } from './auth.js';

export type { StockByProductRow, StockRow };

export function getStoreStock(storeId: string): Promise<StockRow[]> {
  return api.get<StockRow[]>('/stock', { storeId });
}

export function getProductStock(productId: string): Promise<StockByProductRow[]> {
  return api.get<StockByProductRow[]>(`/stock/product/${productId}`);
}

export function confirmInventoryCount(input: ConfirmInventoryCountInput): Promise<{
  storeId: string;
  adjusted: StockRow[];
}> {
  return api.post('/stock/inventory-count', input);
}
