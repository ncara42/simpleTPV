import type { FamilyNode } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import { countDescendants, moveChild, moveRoot, moveToParent, removeNode } from './family-tree.js';

function node(id: string, children: FamilyNode[] = [], parentId: string | null = null): FamilyNode {
  return { id, parentId, name: id, color: null, icon: null, sortOrder: 0, children };
}

// Árbol base: A[A1, A2], B[]
function tree(): FamilyNode[] {
  return [node('A', [node('A1', [], 'A'), node('A2', [], 'A')]), node('B')];
}

describe('moveRoot', () => {
  it('sube una raíz intercambiándola con la anterior', () => {
    expect(moveRoot(tree(), 'B', -1).map((n) => n.id)).toEqual(['B', 'A']);
  });
  it('no cambia nada si el destino queda fuera de rango', () => {
    expect(moveRoot(tree(), 'A', -1).map((n) => n.id)).toEqual(['A', 'B']);
  });
  it('devuelve el árbol intacto si el id no existe', () => {
    expect(moveRoot(tree(), 'Z', 1).map((n) => n.id)).toEqual(['A', 'B']);
  });
});

describe('moveChild', () => {
  it('reordena las hijas dentro de su padre', () => {
    const out = moveChild(tree(), 'A', 'A1', 1);
    expect(out[0]!.children.map((c) => c.id)).toEqual(['A2', 'A1']);
  });
});

describe('moveToParent', () => {
  it('mueve una hija a otra raíz y le actualiza parentId', () => {
    const out = moveToParent(tree(), 'A1', 'B');
    expect(out.find((n) => n.id === 'A')!.children.map((c) => c.id)).toEqual(['A2']);
    const moved = out.find((n) => n.id === 'B')!.children[0]!;
    expect(moved.id).toBe('A1');
    expect(moved.parentId).toBe('B');
  });
  it('no cambia nada si la hija no existe', () => {
    expect(moveToParent(tree(), 'Z', 'B')).toEqual(tree());
  });
});

describe('removeNode', () => {
  it('elimina una raíz', () => {
    expect(removeNode(tree(), 'A').map((n) => n.id)).toEqual(['B']);
  });
  it('elimina una hija', () => {
    const out = removeNode(tree(), 'A1');
    expect(out.find((n) => n.id === 'A')!.children.map((c) => c.id)).toEqual(['A2']);
  });
});

describe('countDescendants', () => {
  it('cuenta hijas y nietas recursivamente', () => {
    expect(countDescendants(node('A', [node('A1', [node('A1a')])]))).toBe(2);
    expect(countDescendants(node('solo'))).toBe(0);
  });
});
