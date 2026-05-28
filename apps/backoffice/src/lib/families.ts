import { api } from './auth.js';

export interface FamilyNode {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  children: FamilyNode[];
}

export interface FamilyInput {
  name: string;
  parentId?: string | null;
  color?: string | null;
}

export async function listFamilies(): Promise<FamilyNode[]> {
  const res = await api.fetch('/product-families');
  if (!res.ok) throw new Error(`Error ${res.status} listando familias`);
  return (await res.json()) as FamilyNode[];
}

export async function createFamily(input: FamilyInput): Promise<FamilyNode> {
  const res = await api.fetch('/product-families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Error ${res.status} creando familia`);
  return (await res.json()) as FamilyNode;
}

export async function updateFamily(id: string, input: Partial<FamilyInput>): Promise<FamilyNode> {
  const res = await api.fetch(`/product-families/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Error ${res.status} actualizando familia`);
  return (await res.json()) as FamilyNode;
}

export async function deleteFamily(id: string): Promise<void> {
  const res = await api.fetch(`/product-families/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status} borrando familia`);
}
