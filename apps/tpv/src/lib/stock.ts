import type { StockByProductRow, StockRow } from '@simpletpv/auth';

import { api } from './auth.js';

export type { StockByProductRow, StockRow };

// Stock de todos los productos de una tienda (#34). El TPV lo usa para mostrar
// la cantidad y el nivel (semáforo) en cada tarjeta de producto de la venta.
export function getStoreStock(storeId: string): Promise<StockRow[]> {
  return api.get<StockRow[]>('/stock', { storeId });
}

// Stock de un producto en todas las tiendas del tenant. Para la consulta puntual
// desde la venta (modal de detalle de un producto).
export function getProductStock(productId: string): Promise<StockByProductRow[]> {
  return api.get<StockByProductRow[]>(`/stock/product/${productId}`);
}
