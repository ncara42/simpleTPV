import type { FamilyInput, FamilyNode } from '@simpletpv/auth';

import { api } from './auth.js';

export type { FamilyInput, FamilyNode };

export function listFamilies(): Promise<FamilyNode[]> {
  return api.get<FamilyNode[]>('/product-families');
}

export function createFamily(input: FamilyInput): Promise<FamilyNode> {
  return api.post<FamilyNode>('/product-families', input);
}

export function updateFamily(id: string, input: Partial<FamilyInput>): Promise<FamilyNode> {
  return api.patch<FamilyNode>(`/product-families/${id}`, input);
}

export function deleteFamily(id: string): Promise<void> {
  return api.del(`/product-families/${id}`);
}
