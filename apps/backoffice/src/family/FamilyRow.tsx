import type { FamilyNode } from '../lib/families.js';

export interface RowActions {
  roots: FamilyNode[];
  onMove: (node: FamilyNode, dir: -1 | 1) => void;
  onMoveTo: (childId: string, toParentId: string) => void;
  onEdit: (n: FamilyNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (n: FamilyNode) => void;
}

// Fila del árbol de familias. Se renderiza a sí misma recursivamente para las
// hijas (el catálogo es de 2 niveles, pero la recursión lo soporta genéricamente).
export function FamilyRow({
  node,
  depth,
  index,
  siblings,
  parentId,
  actions,
}: {
  node: FamilyNode;
  depth: number;
  index: number;
  siblings: number;
  parentId: string | null;
  actions: RowActions;
}) {
  return (
    <>
      <div
        className="fam-row"
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        data-testid="fam-row"
      >
        <span className="fam-reorder">
          <button
            className="fam-arrow"
            disabled={index === 0}
            onClick={() => actions.onMove(node, -1)}
            aria-label="Subir"
            data-testid="fam-up"
          >
            ↑
          </button>
          <button
            className="fam-arrow"
            disabled={index === siblings - 1}
            onClick={() => actions.onMove(node, 1)}
            aria-label="Bajar"
            data-testid="fam-down"
          >
            ↓
          </button>
        </span>
        <span className="fam-name">
          {depth > 0 && <span className="fam-bullet">└</span>}
          <span
            className="fam-color-dot"
            style={{ background: node.color ?? 'var(--ui-text-soft)' }}
          />
          {node.name}
        </span>
        <span className="fam-count" data-testid="fam-count">
          {(node as { productCount?: number }).productCount ?? 0} productos
        </span>
        <span className="fam-actions">
          {depth > 0 && parentId && (
            <select
              className="fam-move-select"
              value={parentId}
              onChange={(e) => actions.onMoveTo(node.id, e.target.value)}
              aria-label="Mover a otra familia"
              data-testid="fam-move-to"
            >
              {actions.roots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id === parentId ? `En: ${r.name}` : `Mover a: ${r.name}`}
                </option>
              ))}
            </select>
          )}
          {depth === 0 && <button onClick={() => actions.onAddChild(node.id)}>+ Hija</button>}
          <button onClick={() => actions.onEdit(node)}>Editar</button>
          <button className="danger" onClick={() => actions.onDelete(node)}>
            Borrar
          </button>
        </span>
      </div>
      {node.children.map((c, i) => (
        <FamilyRow
          key={c.id}
          node={c}
          depth={depth + 1}
          index={i}
          siblings={node.children.length}
          parentId={node.id}
          actions={actions}
        />
      ))}
    </>
  );
}
