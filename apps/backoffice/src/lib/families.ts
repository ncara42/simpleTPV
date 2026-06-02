import type { FamilyInput, FamilyNode } from '@simpletpv/auth';

import { DEMO_FAMILIES } from '../demo/demoData.js';

export type { FamilyInput, FamilyNode };

export function listFamilies(): Promise<FamilyNode[]> {
  return Promise.resolve(DEMO_FAMILIES);
}
export function createFamily(input: FamilyInput): Promise<FamilyNode> {
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
export function updateFamily(id: string, input: Partial<FamilyInput>): Promise<FamilyNode> {
  const base = DEMO_FAMILIES.find((f) => f.id === id) ?? DEMO_FAMILIES[0]!;
  return Promise.resolve({ ...base, ...(input.name ? { name: input.name } : {}) });
}
export function deleteFamily(_id: string): Promise<void> {
  return Promise.resolve();
}
