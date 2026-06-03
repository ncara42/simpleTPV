import type { FamilyNode } from './families.js';

// Operaciones puras de reorganización del árbol de familias (2 niveles). No tocan
// red ni estado de React: reciben el árbol y devuelven uno nuevo, de modo que se
// pueden probar de forma aislada. La demo no persiste el reorden en el backend.

// Intercambia el elemento `index` con su vecino en la dirección `dir` (-1 arriba,
// +1 abajo). Devuelve la misma lista si el destino queda fuera de rango.
function swap<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j]!, next[index]!];
  return next;
}

// Reordena una familia raíz (sube/baja) dentro del primer nivel.
export function moveRoot(tree: FamilyNode[], id: string, dir: -1 | 1): FamilyNode[] {
  const i = tree.findIndex((n) => n.id === id);
  return i < 0 ? tree : swap(tree, i, dir);
}

// Reordena una familia hija dentro de su familia padre.
export function moveChild(
  tree: FamilyNode[],
  parentId: string,
  id: string,
  dir: -1 | 1,
): FamilyNode[] {
  return tree.map((n) =>
    n.id === parentId
      ? {
          ...n,
          children: swap(
            n.children,
            n.children.findIndex((c) => c.id === id),
            dir,
          ),
        }
      : n,
  );
}

// Mueve una familia hija a otra familia raíz. Si no encuentra la hija, no cambia
// nada. La hija conserva su contenido y pasa a colgar del nuevo padre.
export function moveToParent(
  tree: FamilyNode[],
  childId: string,
  toParentId: string,
): FamilyNode[] {
  let moved: FamilyNode | undefined;
  const without = tree.map((n) => {
    const child = n.children.find((c) => c.id === childId);
    if (child) moved = { ...child, parentId: toParentId };
    return { ...n, children: n.children.filter((c) => c.id !== childId) };
  });
  if (!moved) return tree;
  return without.map((n) =>
    n.id === toParentId ? { ...n, children: [...n.children, moved as FamilyNode] } : n,
  );
}

// Elimina un nodo (raíz o hija) del árbol por id.
export function removeNode(tree: FamilyNode[], id: string): FamilyNode[] {
  if (tree.some((n) => n.id === id)) return tree.filter((n) => n.id !== id);
  return tree.map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) }));
}

// Número total de descendientes de un nodo (recursivo).
export function countDescendants(node: FamilyNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}
