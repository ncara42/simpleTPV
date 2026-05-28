import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { api } from './auth.js';

export type { FamilyNode, Product };

export function searchProducts(search: string, familyId: string | null): Promise<Product[]> {
  return api.get<Product[]>('/products', { search, familyId });
}

export function listFamilies(): Promise<FamilyNode[]> {
  return api.get<FamilyNode[]>('/product-families');
}

export async function findByBarcode(code: string): Promise<Product | null> {
  try {
    return await api.get<Product>(`/products/barcode/${encodeURIComponent(code)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}
