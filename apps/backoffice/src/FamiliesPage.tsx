import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  createFamily,
  deleteFamily,
  type FamilyNode,
  listFamilies,
  updateFamily,
} from './lib/families.js';

interface FormState {
  id?: string;
  name: string;
  parentId: string | null;
}

// ─── Operaciones puras de reorganización del árbol (demo: estado local) ───
function swap<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j]!, next[index]!];
  return next;
}
function moveRoot(tree: FamilyNode[], id: string, dir: -1 | 1): FamilyNode[] {
  const i = tree.findIndex((n) => n.id === id);
  return i < 0 ? tree : swap(tree, i, dir);
}
function moveChild(tree: FamilyNode[], parentId: string, id: string, dir: -1 | 1): FamilyNode[] {
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
function moveToParent(tree: FamilyNode[], childId: string, toParentId: string): FamilyNode[] {
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
function removeNode(tree: FamilyNode[], id: string): FamilyNode[] {
  if (tree.some((n) => n.id === id)) return tree.filter((n) => n.id !== id);
  return tree.map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) }));
}
function countDescendants(node: FamilyNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

interface RowActions {
  roots: FamilyNode[];
  onMove: (node: FamilyNode, dir: -1 | 1) => void;
  onMoveTo: (childId: string, toParentId: string) => void;
  onEdit: (n: FamilyNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (n: FamilyNode) => void;
}

function FamilyRow({
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

export function FamiliesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const { data: serverTree = [], isLoading } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });
  // Copia local editable para la reorganización (la demo no persiste en backend).
  const [tree, setTree] = useState<FamilyNode[] | null>(null);
  useEffect(() => {
    if (serverTree.length && tree === null) {
      setTree(serverTree.map((n) => ({ ...n, children: n.children.map((c) => ({ ...c })) })));
    }
  }, [serverTree, tree]);
  const view = tree ?? serverTree;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['families'] });

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      f.id
        ? updateFamily(f.id, { name: f.name })
        : createFamily({ name: f.name, parentId: f.parentId }),
    onSuccess: (saved, f) => {
      setTree((prev) => {
        const base = prev ?? view;
        if (f.id) {
          // Renombrar en el árbol (raíz o hija).
          return base.map((n) =>
            n.id === f.id
              ? { ...n, name: f.name }
              : {
                  ...n,
                  children: n.children.map((c) => (c.id === f.id ? { ...c, name: f.name } : c)),
                },
          );
        }
        const node: FamilyNode = { ...saved, children: [] };
        if (f.parentId) {
          return base.map((n) =>
            n.id === f.parentId ? { ...n, children: [...n.children, node] } : n,
          );
        }
        return [...base, node];
      });
      setForm(null);
      invalidate();
    },
  });

  const delMut = useMutation({ mutationFn: (id: string) => deleteFamily(id) });

  const onMove = (node: FamilyNode, dir: -1 | 1): void =>
    setTree((prev) => {
      const base = prev ?? view;
      return node.parentId
        ? moveChild(base, node.parentId, node.id, dir)
        : moveRoot(base, node.id, dir);
    });

  const onMoveTo = (childId: string, toParentId: string): void =>
    setTree((prev) => moveToParent(prev ?? view, childId, toParentId));

  const onDelete = (node: FamilyNode): void => {
    const n = countDescendants(node);
    if (
      n > 0 &&
      !window.confirm(`"${node.name}" tiene ${n} subfamilia(s). ¿Borrar todo el grupo?`)
    ) {
      return;
    }
    delMut.mutate(node.id);
    setTree((prev) => removeNode(prev ?? view, node.id));
  };

  const actions: RowActions = {
    roots: view,
    onMove,
    onMoveTo,
    onEdit: (node) => setForm({ id: node.id, name: node.name, parentId: node.parentId }),
    onAddChild: (parentId) => setForm({ name: '', parentId }),
    onDelete,
  };

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Familias</h2>
          <p className="catalog-sub">Estructura de catálogo · reordena y mueve · 2 niveles</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setForm({ name: '', parentId: null })}
          data-testid="new-family"
        >
          Nueva familia
        </button>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : view.length === 0 ? (
        <p className="catalog-empty" data-testid="families-empty">
          Sin familias. Crea la primera.
        </p>
      ) : (
        <div className="fam-tree" data-testid="fam-tree">
          {view.map((n, i) => (
            <FamilyRow
              key={n.id}
              node={n}
              depth={0}
              index={i}
              siblings={view.length}
              parentId={null}
              actions={actions}
            />
          ))}
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="modal modal--form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate(form);
            }}
            data-testid="family-form"
          >
            <h3>
              {form.id
                ? 'Editar familia'
                : form.parentId
                  ? 'Nueva familia hija'
                  : 'Nueva familia raíz'}
            </h3>
            <label>
              Nombre
              <input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="family-name"
              />
            </label>
            {saveMut.isError && <p className="form-error">No se pudo guardar.</p>}
            <div className="modal-foot">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saveMut.isPending}
                data-testid="family-save"
              >
                {saveMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
