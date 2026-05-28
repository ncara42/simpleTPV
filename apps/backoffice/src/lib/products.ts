import { api } from './auth.js';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: string;
  costPrice: string;
  taxRate: string;
  active: boolean;
}

export interface ProductInput {
  name: string;
  salePrice: number;
  sku?: string | null;
  barcode?: string | null;
  costPrice?: number;
  taxRate?: number;
}

export async function listProducts(search?: string): Promise<Product[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await api.fetch(`/products${qs}`);
  if (!res.ok) throw new Error(`Error ${res.status} listando productos`);
  return (await res.json()) as Product[];
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const res = await api.fetch('/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Error ${res.status} creando producto`);
  return (await res.json()) as Product;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const res = await api.fetch(`/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Error ${res.status} actualizando producto`);
  return (await res.json()) as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await api.fetch(`/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status} borrando producto`);
}
