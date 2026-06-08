import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { api } from './auth.js';

export type { FamilyNode, Product };

export function familySubtreeIds(roots: FamilyNode[], familyId: string): Set<string> {
  const ids = new Set<string>();
  const collect = (node: FamilyNode): void => {
    ids.add(node.id);
    node.children.forEach(collect);
  };
  const find = (nodes: FamilyNode[]): FamilyNode | null => {
    for (const n of nodes) {
      if (n.id === familyId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  const node = find(roots);
  if (node) collect(node);
  return ids;
}

export function searchProducts(search: string, familyId: string | null): Promise<Product[]> {
  const term = search.trim();
  return api.get<Product[]>('/products', {
    ...(term ? { search: term } : {}),
    ...(familyId ? { familyId } : {}),
  });
}

export function listFamilies(): Promise<FamilyNode[]> {
  return api.get<FamilyNode[]>('/product-families');
}

export async function findByBarcode(code: string): Promise<Product | null> {
  try {
    return await api.get<Product>(`/products/barcode/${encodeURIComponent(code)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
