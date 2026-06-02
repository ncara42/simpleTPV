import type { StockByProductRow, StockRow } from '@simpletpv/auth';

import { DEMO_STOCK_ROWS, DEMO_STORE_ID, DEMO_STORE_LABEL } from '../demo/demoData.js';

export type { StockByProductRow, StockRow };

export function getStoreStock(_storeId: string): Promise<StockRow[]> {
  return Promise.resolve(DEMO_STOCK_ROWS);
}

export function getProductStock(productId: string): Promise<StockByProductRow[]> {
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
