import type { ConfirmInventoryCountInput, StockByProductRow, StockRow } from '@simpletpv/auth';

import { DEMO_STOCK_ROWS, DEMO_STORE_ID, DEMO_STORE_LABEL } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { StockByProductRow, StockRow };

// Stock de la tienda activa (cantidad + nivel del semáforo por producto).
export function getStoreStock(storeId: string): Promise<StockRow[]> {
  if (isDemo()) return Promise.resolve(DEMO_STOCK_ROWS);
  return api.get<StockRow[]>('/stock', { storeId });
}

// Stock de un producto en todas las tiendas del tenant.
export function getProductStock(productId: string): Promise<StockByProductRow[]> {
  if (isDemo()) {
    const row = DEMO_STOCK_ROWS.find((r) => r.productId === productId);
    if (!row) return Promise.resolve([]);
    return Promise.resolve([
      {
        productId,
        storeId: DEMO_STORE_ID,
        storeName: DEMO_STORE_LABEL,
        quantity: row.quantity,
        minStock: row.minStock,
        level: row.level,
      },
    ]);
  }
  return api.get<StockByProductRow[]>(`/stock/product/${productId}`);
}

export function confirmInventoryCount(input: ConfirmInventoryCountInput): Promise<{
  storeId: string;
  adjusted: StockRow[];
}> {
  if (isDemo()) {
    return Promise.resolve({
      storeId: input.storeId,
      adjusted: input.lines.map((line) => {
        const product = DEMO_STOCK_ROWS.find((row) => row.productId === line.productId);
        return {
          productId: line.productId,
          productName: product?.productName ?? line.productId,
          storeId: input.storeId,
          quantity: line.countedQuantity,
          minStock: product?.minStock ?? 0,
          level: line.countedQuantity <= 0 ? 'red' : ('green' as const),
        };
      }),
    });
  }
  return api.post('/stock/inventory-count', input);
}
