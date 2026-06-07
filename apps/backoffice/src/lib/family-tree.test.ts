import type { FamilyNode } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import {
  countDescendants,
  findNode,
  findNodePath,
  flattenTree,
  insertChild,
  isDescendantOf,
  moveChild,
  moveRoot,
  moveToParent,
  removeNode,
  reorderSiblings,
} from './family-tree.js';

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

// ── Profundidad arbitraria (N niveles) ──────────────────────────────────────
// Árbol de 3 niveles: A[A1[A1a, A1b], A2], B
function deepTree(): FamilyNode[] {
  return [
    node(
      'A',
      [node('A1', [node('A1a', [], 'A1'), node('A1b', [], 'A1')], 'A'), node('A2', [], 'A')],
      null,
    ),
    node('B'),
  ];
}

describe('removeNode (N niveles)', () => {
  it('elimina un nieto', () => {
    const out = removeNode(deepTree(), 'A1a');
    expect(findNode(out, 'A1a')).toBeNull();
    expect(findNode(out, 'A1')!.children.map((c) => c.id)).toEqual(['A1b']);
  });
});

describe('insertChild', () => {
  it('inserta como hijo de un nodo en profundidad', () => {
    const out = insertChild(deepTree(), 'A1', node('A1c', [], 'A1'));
    expect(findNode(out, 'A1')!.children.map((c) => c.id)).toEqual(['A1a', 'A1b', 'A1c']);
  });
});

describe('moveToParent (N niveles + anti-ciclo)', () => {
  it('mueve un nieto a otra rama conservando su subárbol', () => {
    const out = moveToParent(deepTree(), 'A1', 'B');
    expect(findNode(out, 'A')!.children.map((c) => c.id)).toEqual(['A2']);
    const moved = findNode(out, 'B')!.children[0]!;
    expect(moved.id).toBe('A1');
    expect(moved.parentId).toBe('B');
    expect(moved.children.map((c) => c.id)).toEqual(['A1a', 'A1b']);
  });
  it('no mueve un nodo dentro de su propio subárbol (ciclo)', () => {
    expect(moveToParent(deepTree(), 'A', 'A1a')).toEqual(deepTree());
  });
});

describe('reorderSiblings (N niveles)', () => {
  it('reordena nietos dentro de su padre', () => {
    const out = reorderSiblings(deepTree(), 'A1', 'A1b', 'A1a', 'before');
    expect(findNode(out, 'A1')!.children.map((c) => c.id)).toEqual(['A1b', 'A1a']);
  });
  it('reordena raíces con parentId null', () => {
    const out = reorderSiblings(deepTree(), null, 'B', 'A', 'before');
    expect(out.map((n) => n.id)).toEqual(['B', 'A']);
  });
});

describe('findNodePath', () => {
  it('devuelve la ruta de raíz a nieto', () => {
    expect(findNodePath(deepTree(), 'A1a').map((n) => n.id)).toEqual(['A', 'A1', 'A1a']);
  });
  it('devuelve [] si no existe', () => {
    expect(findNodePath(deepTree(), 'Z')).toEqual([]);
  });
});

describe('flattenTree', () => {
  it('aplana en DFS con profundidad', () => {
    expect(flattenTree(deepTree()).map((f) => [f.node.id, f.depth])).toEqual([
      ['A', 0],
      ['A1', 1],
      ['A1a', 2],
      ['A1b', 2],
      ['A2', 1],
      ['B', 0],
    ]);
  });
});

describe('isDescendantOf', () => {
  it('reconoce descendientes y a sí mismo', () => {
    expect(isDescendantOf(deepTree(), 'A', 'A1a')).toBe(true);
    expect(isDescendantOf(deepTree(), 'A', 'A')).toBe(true);
    expect(isDescendantOf(deepTree(), 'A1', 'A2')).toBe(false);
    expect(isDescendantOf(deepTree(), 'B', 'A1a')).toBe(false);
  });
});
