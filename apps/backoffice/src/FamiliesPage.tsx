import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
// Posición de inserción respecto a la fila destino durante el arrastre.
type DropPosition = 'before' | 'after';
// Reordena por arrastre: inserta `fromId` antes/después de `toId` entre sus hermanos.
function reorderSiblings(
  tree: FamilyNode[],
  parentId: string | null,
  fromId: string,
  toId: string,
  position: DropPosition,
): FamilyNode[] {
  const move = (list: FamilyNode[]): FamilyNode[] => {
    const from = list.findIndex((n) => n.id === fromId);
    const to = list.findIndex((n) => n.id === toId);
    if (from < 0 || to < 0 || from === to) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    // Índice de destino recalculado tras extraer `moved` (puede haberse desplazado).
    const targetIndex = next.findIndex((n) => n.id === toId);
    const insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
    next.splice(insertAt, 0, moved!);
    return next;
  };
  if (parentId === null) return move(tree);
  return tree.map((n) => (n.id === parentId ? { ...n, children: move(n.children) } : n));
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
  dragId: string | null;
  dropTarget: { id: string; position: DropPosition } | null;
  onDragStart: (node: FamilyNode) => void;
  onDragEnd: () => void;
  canDropOn: (target: FamilyNode) => boolean;
  onDragOver: (target: FamilyNode, position: DropPosition) => void;
  onDrop: (target: FamilyNode) => void;
  onMoveTo: (childId: string, toParentId: string) => void;
  onEdit: (n: FamilyNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (n: FamilyNode) => void;
}

function FamilyRow({
  node,
  depth,
  parentId,
  actions,
}: {
  node: FamilyNode;
  depth: number;
  parentId: string | null;
  actions: RowActions;
}) {
  const dragging = actions.dragId === node.id;
  const drop = actions.dropTarget?.id === node.id ? actions.dropTarget.position : null;
  return (
    <>
      <div
        className={`fam-row${dragging ? ' fam-dragging' : ''}${
          drop ? ` fam-row--drop-${drop}` : ''
        }`}
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        data-testid="fam-row"
        data-fam-id={node.id}
        draggable
        onDragStart={() => actions.onDragStart(node)}
        onDragEnd={() => actions.onDragEnd()}
        onDragOver={(e) => {
          if (!actions.canDropOn(node)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const position: DropPosition =
            e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
          actions.onDragOver(node, position);
        }}
        onDrop={(e) => {
          e.preventDefault();
          actions.onDrop(node);
        }}
      >
        <span className="fam-grip" aria-hidden="true" data-testid="fam-grip">
          ⠿
        </span>
        <span className="fam-name">
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
            <Select
              className="fam-move-select"
              value={parentId}
              onChange={(value) => actions.onMoveTo(node.id, value)}
              triggerLabel="Mover"
              options={actions.roots.map((r) => ({
                value: r.id,
                label: r.id === parentId ? r.name : `Mover a: ${r.name}`,
              }))}
              ariaLabel="Mover a otra familia"
              data-testid="fam-move-to"
            />
          )}
          {depth === 0 && <button onClick={() => actions.onAddChild(node.id)}>+ Hija</button>}
          <button onClick={() => actions.onEdit(node)}>Editar</button>
          <button className="danger" onClick={() => actions.onDelete(node)}>
            Borrar
          </button>
        </span>
      </div>
      {node.children.map((c) => (
        <FamilyRow key={c.id} node={c} depth={depth + 1} parentId={node.id} actions={actions} />
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

  // FLIP: anima el cambio de posición de las filas al reordenar (Web Animations API).
  const treeRef = useRef<HTMLDivElement>(null);
  const prevTops = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const container = treeRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    for (const el of container.querySelectorAll<HTMLElement>('[data-fam-id]')) {
      const id = el.dataset.famId;
      if (!id) continue;
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      const oldTop = prevTops.current.get(id);
      if (oldTop !== undefined && !reduceMotion) {
        const delta = oldTop - top;
        if (Math.abs(delta) > 1) {
          el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
            duration: 200,
            easing: 'ease-out',
          });
        }
      }
    }
    prevTops.current = next;
  }, [view]);

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

  // Reordenación por arrastre (solo entre hermanos del mismo nivel).
  const [dragNode, setDragNode] = useState<FamilyNode | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const canDropOn = (target: FamilyNode): boolean =>
    dragNode !== null && dragNode.id !== target.id && dragNode.parentId === target.parentId;
  const onDragOver = (target: FamilyNode, position: DropPosition): void =>
    setDropTarget((cur) =>
      cur?.id === target.id && cur.position === position ? cur : { id: target.id, position },
    );
  const clearDrag = (): void => {
    setDragNode(null);
    setDropTarget(null);
  };
  const onDrop = (target: FamilyNode): void => {
    if (!dragNode || !canDropOn(target)) return clearDrag();
    const from = dragNode;
    const position = dropTarget?.id === target.id ? dropTarget.position : 'before';
    setTree((prev) => reorderSiblings(prev ?? view, target.parentId, from.id, target.id, position));
    clearDrag();
  };

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
    dragId: dragNode?.id ?? null,
    dropTarget,
    onDragStart: setDragNode,
    onDragEnd: clearDrag,
    canDropOn,
    onDragOver,
    onDrop,
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
        <div className="fam-tree" data-testid="fam-tree" ref={treeRef}>
          {view.map((n) => (
            <FamilyRow key={n.id} node={n} depth={0} parentId={null} actions={actions} />
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
