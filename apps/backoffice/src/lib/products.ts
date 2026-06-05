import type { Product, ProductInput } from '@simpletpv/auth';

import { DEMO_PRODUCTS } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { Product, ProductInput };

// Catálogo (IT-09). En real va contra /products; el search se manda como query.
export function listProducts(search?: string): Promise<Product[]> {
  const term = (search ?? '').trim();
  if (isDemo()) {
    const t = term.toLowerCase();
    const rows =
      t === ''
        ? DEMO_PRODUCTS
        : DEMO_PRODUCTS.filter(
            (p) => p.name.toLowerCase().includes(t) || (p.sku ?? '').toLowerCase().includes(t),
          );
    return Promise.resolve(rows);
  }
  return api.get<Product[]>('/products', { ...(term ? { search: term } : {}) });
}
export function createProduct(input: ProductInput): Promise<Product> {
  if (isDemo()) {
    return Promise.resolve({
      id: `p-${input.name}`,
      name: input.name,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      description: null,
      salePrice: String(input.salePrice),
      costPrice: String(input.costPrice ?? 0),
      taxRate: String(input.taxRate ?? 21),
      saleUnit: 'unit',
      unitSymbol: 'ud',
      familyId: input.familyId ?? null,
      active: true,
    });
  }
  return api.post<Product>('/products', input);
}
export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  if (isDemo()) {
    const base = DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0]!;
    return Promise.resolve({
      ...base,
      ...(input.name ? { name: input.name } : {}),
      ...(input.salePrice != null ? { salePrice: String(input.salePrice) } : {}),
    });
  }
  return api.patch<Product>(`/products/${id}`, input);
}
export function deleteProduct(id: string): Promise<void> {
  if (isDemo()) return Promise.resolve();
  return api.del(`/products/${id}`);
}

export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

export function importProductsCsv(csv: string): Promise<ImportResult> {
  return api.post<ImportResult>('/products/import', { csv });
}
