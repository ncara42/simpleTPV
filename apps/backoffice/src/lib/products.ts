import type { ImportResult, Product, ProductInput } from '@simpletpv/auth';

import { api } from './auth.js';

export type { ImportResult, Product, ProductInput };

export function listProducts(search?: string): Promise<Product[]> {
  const term = (search ?? '').trim();
  return api.get<Product[]>('/products', { ...(term ? { search: term } : {}) });
}

export function createProduct(input: ProductInput): Promise<Product> {
  return api.post<Product>('/products', input);
}

export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return api.patch<Product>(`/products/${id}`, input);
}

export function deleteProduct(id: string): Promise<void> {
  return api.del(`/products/${id}`);
}

export function importProductsCsv(csv: string): Promise<ImportResult> {
  return api.post<ImportResult>('/products/import', { csv });
}
