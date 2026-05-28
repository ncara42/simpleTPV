import { api } from './auth.js';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  salePrice: string;
  familyId: string | null;
}

export interface FamilyNode {
  id: string;
  name: string;
  color: string | null;
  children: FamilyNode[];
}

export async function searchProducts(search: string, familyId: string | null): Promise<Product[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (familyId) params.set('familyId', familyId);
  const qs = params.toString();
  const res = await api.fetch(`/products${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Error ${res.status} buscando productos`);
  return (await res.json()) as Product[];
}

export async function listFamilies(): Promise<FamilyNode[]> {
  const res = await api.fetch('/product-families');
  if (!res.ok) throw new Error(`Error ${res.status} listando familias`);
  return (await res.json()) as FamilyNode[];
}
