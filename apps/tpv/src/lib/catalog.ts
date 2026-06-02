import { ApiError, type FamilyNode, type Product } from '@simpletpv/auth';

import { DEMO_FAMILIES, DEMO_PRODUCTS } from '../demo/demoData.js';

export type { FamilyNode, Product };

export function searchProducts(search: string, familyId: string | null): Promise<Product[]> {
  const term = search.trim().toLowerCase();
  const filtered = DEMO_PRODUCTS.filter((p) => {
    const matchFamily = familyId === null || p.familyId === familyId;
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
