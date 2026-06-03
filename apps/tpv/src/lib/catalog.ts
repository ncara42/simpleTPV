import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { DEMO_FAMILIES, DEMO_PRODUCTS } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { FamilyNode, Product };

// Ids del subárbol de una familia (ella misma + todas sus descendientes). Permite
// que al seleccionar una familia PADRE se muestren también los productos de sus
// subfamilias. NOTA (modo real): el endpoint GET /products?familyId= filtra por
// igualdad exacta; el filtrado por subárbol aplica solo en modo demo (en real, al
// no haber jerarquía en el seed actual, el filtro exacto basta).
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
  if (isDemo()) {
    const lower = term.toLowerCase();
    const subtree = familyId ? familySubtreeIds(DEMO_FAMILIES, familyId) : null;
    const filtered = DEMO_PRODUCTS.filter((p) => {
      const matchFamily = subtree === null || (p.familyId !== null && subtree.has(p.familyId));
      const matchTerm =
        lower === '' ||
        p.name.toLowerCase().includes(lower) ||
        (p.sku ?? '').toLowerCase().includes(lower);
      return matchFamily && matchTerm;
    });
    return Promise.resolve(filtered);
  }
  return api.get<Product[]>('/products', {
    ...(term ? { search: term } : {}),
    ...(familyId ? { familyId } : {}),
  });
}

export function listFamilies(): Promise<FamilyNode[]> {
  if (isDemo()) return Promise.resolve(DEMO_FAMILIES);
  return api.get<FamilyNode[]>('/product-families');
}

export async function findByBarcode(code: string): Promise<Product | null> {
  if (isDemo()) {
    return DEMO_PRODUCTS.find((p) => p.barcode === code) ?? null;
  }
  try {
    return await api.get<Product>(`/products/barcode/${encodeURIComponent(code)}`);
  } catch (e) {
    // Código sin producto asociado → 404 del backend, no es un error de la UI.
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
