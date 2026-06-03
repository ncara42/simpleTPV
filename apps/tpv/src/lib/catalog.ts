import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { DEMO_FAMILIES, DEMO_PRODUCTS } from '../demo/demoData.js';

export type { FamilyNode, Product };

// Ids del subárbol de una familia (ella misma + todas sus descendientes). Permite
// que al seleccionar una familia PADRE se muestren también los productos de sus
// subfamilias. NOTA (Fase 2): el endpoint real GET /products?familyId= filtra por
// igualdad exacta; al cablear la API habrá que añadir filtro por subárbol en el
// backend (resolver descendientes con findTree) o resolverlos aquí en cliente.
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
  const term = search.trim().toLowerCase();
  const subtree = familyId ? familySubtreeIds(DEMO_FAMILIES, familyId) : null;
  const filtered = DEMO_PRODUCTS.filter((p) => {
    const matchFamily = subtree === null || (p.familyId !== null && subtree.has(p.familyId));
    const matchTerm =
      term === '' ||
      p.name.toLowerCase().includes(term) ||
      (p.sku ?? '').toLowerCase().includes(term);
    return matchFamily && matchTerm;
  });
  return Promise.resolve(filtered);
}

export function listFamilies(): Promise<FamilyNode[]> {
  return Promise.resolve(DEMO_FAMILIES);
}

export function findByBarcode(code: string): Promise<Product | null> {
  void ApiError; // tipo reexportado por compatibilidad
  const found = DEMO_PRODUCTS.find((p) => p.barcode === code) ?? null;
  return Promise.resolve(found);
}
