import type { Product, ProductInput } from '@simpletpv/auth';

import { api } from './auth.js';

export type { Product, ProductInput };

export function listProducts(search?: string): Promise<Product[]> {
  return api.get<Product[]>('/products', { search });
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
