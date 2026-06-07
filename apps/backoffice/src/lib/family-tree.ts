import type { FamilyNode } from './families.js';

// Operaciones puras de reorganización del árbol de familias (arquetipos) de
// profundidad ARBITRARIA. No tocan red ni estado de React: reciben el árbol y
// devuelven uno nuevo, de modo que se pueden probar de forma aislada. La demo no
// persiste el reorden en el backend.

export type DropPosition = 'before' | 'after';

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

// Reordena una familia hija dentro de su familia padre directo.
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
      : { ...n, children: moveChild(n.children, parentId, id, dir) },
  );
}

// Busca un nodo por id en cualquier nivel.
export function findNode(tree: FamilyNode[], id: string): FamilyNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

// ¿`id` está dentro del subárbol (descendientes) de `node`?
function subtreeContains(node: FamilyNode, id: string): boolean {
  return node.children.some((c) => c.id === id || subtreeContains(c, id));
}

// Elimina un nodo por id en cualquier nivel (recursivo).
export function removeNode(tree: FamilyNode[], id: string): FamilyNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

// Inserta `node` como último hijo de `parentId` (en cualquier nivel).
export function insertChild(tree: FamilyNode[], parentId: string, node: FamilyNode): FamilyNode[] {
  return tree.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, node] }
      : { ...n, children: insertChild(n.children, parentId, node) },
  );
}

// Mueve un nodo (de cualquier nivel) para que cuelgue de `toParentId`, conservando
// su subárbol. No hace nada si el nodo no existe o si crearía un ciclo (mover un
// nodo dentro de su propio subárbol).
export function moveToParent(
  tree: FamilyNode[],
  childId: string,
  toParentId: string,
): FamilyNode[] {
  if (childId === toParentId) return tree;
  const node = findNode(tree, childId);
  if (!node) return tree;
  if (subtreeContains(node, toParentId)) return tree; // anti-ciclo
  const detached = removeNode(tree, childId);
  return insertChild(detached, toParentId, { ...node, parentId: toParentId });
}

// Reordena un nodo entre sus hermanos en cualquier nivel. `parentId === null` para
// las raíces. `position` indica si el nodo movido va antes o después del destino.
export function reorderSiblings(
  tree: FamilyNode[],
  parentId: string | null,
  fromId: string,
  toId: string,
  position: DropPosition,
): FamilyNode[] {
  const reorder = (list: FamilyNode[]): FamilyNode[] => {
    const from = list.findIndex((n) => n.id === fromId);
    if (from < 0 || fromId === toId || !list.some((n) => n.id === toId)) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    const to = next.findIndex((n) => n.id === toId);
    next.splice(position === 'after' ? to + 1 : to, 0, moved!);
    return next;
  };
  if (parentId === null) return reorder(tree);
  return tree.map((n) =>
    n.id === parentId
      ? { ...n, children: reorder(n.children) }
      : { ...n, children: reorderSiblings(n.children, parentId, fromId, toId, position) },
  );
}

// Número total de descendientes de un nodo (recursivo).
export function countDescendants(node: FamilyNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

// Ruta de raíz al nodo (ambos incluidos), o [] si no existe.
export function findNodePath(tree: FamilyNode[], id: string): FamilyNode[] {
  for (const n of tree) {
    if (n.id === id) return [n];
    const sub = findNodePath(n.children, id);
    if (sub.length) return [n, ...sub];
  }
  return [];
}

export interface FlatNode {
  node: FamilyNode;
  depth: number;
}

// Aplana el árbol en orden DFS, anotando la profundidad de cada nodo. Útil para
// selectores jerárquicos (sangría por profundidad).
export function flattenTree(tree: FamilyNode[], depth = 0): FlatNode[] {
  return tree.flatMap((n) => [{ node: n, depth }, ...flattenTree(n.children, depth + 1)]);
}

// ¿`nodeId` es `ancestorId` o uno de sus descendientes? Para filtrar por arquetipo
// incluyendo su subárbol.
export function isDescendantOf(tree: FamilyNode[], ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId) return true;
  const anc = findNode(tree, ancestorId);
  return anc ? subtreeContains(anc, nodeId) : false;
}
