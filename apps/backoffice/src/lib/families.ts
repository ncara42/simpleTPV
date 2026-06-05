import type { FamilyInput, FamilyNode } from '@simpletpv/auth';

import { DEMO_FAMILIES } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { FamilyInput, FamilyNode };

// Familias de producto (IT-09). En modo real va contra /product-families; en demo
// devuelve los datos hardcodeados. El backend ya anida los hijos en el árbol.
export function listFamilies(): Promise<FamilyNode[]> {
  if (isDemo()) return Promise.resolve(DEMO_FAMILIES);
  return api.get<FamilyNode[]>('/product-families');
}
export function createFamily(input: FamilyInput): Promise<FamilyNode> {
  if (isDemo()) {
    return Promise.resolve({
      id: `fam-${input.name}`,
      parentId: input.parentId ?? null,
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      children: [],
    });
  }
  return api.post<FamilyNode>('/product-families', input);
}
export function updateFamily(id: string, input: Partial<FamilyInput>): Promise<FamilyNode> {
  if (isDemo()) {
    const base = DEMO_FAMILIES.find((f) => f.id === id) ?? DEMO_FAMILIES[0]!;
    return Promise.resolve({ ...base, ...(input.name ? { name: input.name } : {}) });
  }
  return api.patch<FamilyNode>(`/product-families/${id}`, input);
}
export function deleteFamily(id: string): Promise<void> {
  if (isDemo()) return Promise.resolve();
  return api.del(`/product-families/${id}`);
}
