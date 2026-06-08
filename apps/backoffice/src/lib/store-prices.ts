import type { StorePriceOverride } from '@simpletpv/auth';

import { DEMO_PRODUCTS } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { StorePriceOverride };

// ── Estado demo (mutable en memoria durante la sesión) ───────────────────────
// Precios retail por tienda (#127 A): override del PVP por (producto, tienda). Las
// funciones demo mutan estos overrides in-place; con invalidateQueries la UI re-lee
// y refleja los cambios, dando una demo funcional sin backend. Solo la tienda Centro
// trae overrides de ejemplo; el resto parte sin overrides (usan el PVP del catálogo).
const demoStorePrices: Record<string, StorePriceOverride[]> = {
  's-centro': [
    {
      id: 'sp-centro-1',
      productId: 'p-aceite-cbd-10',
      price: '19.90',
      product: { name: 'Aceite CBD 10%', salePrice: '24.90' },
    },
    {
      id: 'sp-centro-2',
      productId: 'p-flor-lemon-haze',
      price: '11.90',
      product: { name: 'Flor Lemon Haze 2g', salePrice: '14.50' },
    },
  ],
};

export function listStorePrices(storeId: string): Promise<StorePriceOverride[]> {
  if (isDemo()) return Promise.resolve((demoStorePrices[storeId] ?? []).map((p) => ({ ...p })));
  return api.get<StorePriceOverride[]>(`/stores/${storeId}/prices`);
}

export function setStorePrice(storeId: string, productId: string, price: number): Promise<void> {
  if (isDemo()) {
    const list = (demoStorePrices[storeId] ??= []);
    const prod = DEMO_PRODUCTS.find((p) => p.id === productId);
    const existing = list.find((p) => p.productId === productId);
    if (existing) {
      existing.price = price.toFixed(2);
    } else {
      list.push({
        id: `sp-${Date.now()}`,
        productId,
        price: price.toFixed(2),
        product: { name: prod?.name ?? productId, salePrice: prod?.salePrice ?? '0' },
      });
    }
    return Promise.resolve();
  }
  return api.put<void>(`/stores/${storeId}/prices`, { productId, price });
}

export function removeStorePrice(storeId: string, productId: string): Promise<void> {
  if (isDemo()) {
    const list = demoStorePrices[storeId] ?? [];
    const i = list.findIndex((p) => p.productId === productId);
    if (i >= 0) list.splice(i, 1);
    return Promise.resolve();
  }
  return api.del(`/stores/${storeId}/prices/${productId}`);
}
