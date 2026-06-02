import type { Product, ProductInput } from '@simpletpv/auth';

import { DEMO_PRODUCTS } from '../demo/demoData.js';
import { api } from './auth.js';

export type { Product, ProductInput };

export function listProducts(search?: string): Promise<Product[]> {
  const term = (search ?? '').trim().toLowerCase();
  const rows =
    term === ''
      ? DEMO_PRODUCTS
      : DEMO_PRODUCTS.filter(
          (p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term),
        );
  return Promise.resolve(rows);
}
export function createProduct(input: ProductInput): Promise<Product> {
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
export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const base = DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0]!;
  return Promise.resolve({
    ...base,
    ...(input.name ? { name: input.name } : {}),
    ...(input.salePrice != null ? { salePrice: String(input.salePrice) } : {}),
  });
}
export function deleteProduct(_id: string): Promise<void> {
  return Promise.resolve();
}

export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

export function importProductsCsv(csv: string): Promise<ImportResult> {
  return api.post<ImportResult>('/products/import', { csv });
}
