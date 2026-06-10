import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useConfirm } from './components/ConfirmProvider.js';
import { Modal } from './components/Modal.js';
import {
  createFamily,
  deleteFamily,
  type FamilyNode,
  listFamilies,
  updateFamily,
} from './lib/families.js';
import {
  countDescendants,
  type DropPosition,
  findNode,
  flattenTree,
  insertChild,
  isDescendantOf,
  moveToParent,
  removeNode,
  renumberSiblings,
  reorderSiblings,
} from './lib/family-tree.js';
import { formErrorMessage } from './lib/form-error.js';
import { usePageHeader } from './lib/pageHeader.js';

interface FormState {
  id?: string;
  name: string;
  parentId: string | null;
  // Marcar el nodo como arquetipo (solo productos, sin subniveles).
  isArchetype: boolean;
  // Si el nodo editado ya tiene subniveles, no puede convertirse en arquetipo.
  hasChildren: boolean;
}

// Normaliza para buscar sin distinguir mayúsculas ni acentos.
const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

// Plegado del árbol: se recuerda en el navegador (localStorage) entre sesiones.
const COLLAPSE_KEY = 'simpletpv.families.collapsed';
const EMPTY_COLLAPSE: ReadonlySet<string> = new Set();
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveCollapsed(ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...ids]));
  } catch {
    /* almacenamiento no disponible: el plegado no se recuerda esta sesión */
  }
}

interface RowActions {
  roots: FamilyNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  // Nodos plegados (sus hijas no se muestran). Vacío mientras se busca.
  collapsedIds: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
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
  onDelete: (n: FamilyNode) => void | Promise<void>;
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
  const selected = actions.selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const collapsed = actions.collapsedIds.has(node.id);
  // Destinos válidos para "Mover": cualquier familia/subfamilia salvo el propio
  // subárbol y el padre actual; NUNCA un arquetipo (solo contiene productos).
  // La sangría del label indica la profundidad del destino.
  const moveOptions = flattenTree(actions.roots)
    .filter(
      (f) =>
        !isDescendantOf(actions.roots, node.id, f.node.id) &&
        f.node.id !== parentId &&
        !f.node.isArchetype,
    )
    .map((f) => ({ value: f.node.id, label: `${'– '.repeat(f.depth)}${f.node.name}` }));
  return (
    <>
      <div
        className={`fam-row${depth === 0 ? ' fam-row--root' : ''}${
          selected ? ' is-selected' : ''
        }${dragging ? ' fam-dragging' : ''}${drop ? ` fam-row--drop-${drop}` : ''}`}
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        data-testid="fam-row"
        data-fam-id={node.id}
        draggable
        tabIndex={0}
        aria-expanded={selected}
        onClick={() => actions.onSelect(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            actions.onSelect(node.id);
          }
        }}
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
        {hasChildren ? (
          <button
            type="button"
            className="fam-toggle"
            aria-label={collapsed ? 'Desplegar' : 'Plegar'}
            aria-expanded={!collapsed}
            data-testid="fam-toggle"
            onClick={(e) => {
              e.stopPropagation();
              actions.onToggleCollapse(node.id);
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="fam-toggle fam-toggle--leaf" aria-hidden="true" />
        )}
        <span className="fam-grip" aria-hidden="true" data-testid="fam-grip">
          ⠿
        </span>
        <span className="fam-name">
          <span
            className="fam-color-dot"
            style={{ background: node.color ?? 'var(--ui-text-soft)' }}
          />
          {node.name}
          {node.isArchetype && (
            <span className="fam-badge" data-testid="fam-archetype-badge">
              Arquetipo
            </span>
          )}
        </span>
        <span className="fam-count" data-testid="fam-count">
          {(node as { productCount?: number }).productCount ?? 0} productos
        </span>
        {selected && (
          <span className="fam-actions" onClick={(e) => e.stopPropagation()}>
            {moveOptions.length > 0 && (
              <Select
                className="fam-move-select"
                value=""
                onChange={(value) => {
                  if (value) actions.onMoveTo(node.id, value);
                }}
                triggerLabel="Mover"
                options={[{ value: '', label: 'Mover bajo…' }, ...moveOptions]}
                ariaLabel="Mover bajo otra familia"
                data-testid="fam-move-to"
              />
            )}
            {!node.isArchetype && (
              <button onClick={() => actions.onAddChild(node.id)} data-testid="fam-add-child">
                + Subnivel
              </button>
            )}
            <button onClick={() => actions.onEdit(node)}>Editar</button>
            <button className="danger" onClick={() => void actions.onDelete(node)}>
              Borrar
            </button>
          </span>
        )}
      </div>
      {!collapsed &&
        node.children.map((c) => (
          <FamilyRow key={c.id} node={c} depth={depth + 1} parentId={node.id} actions={actions} />
        ))}
    </>
  );
}

export function FamiliesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState | null>(null);
  // Toolbar de la tabla: búsqueda por nombre + filtro por familia raíz.
  const [search, setSearch] = useState('');
  const [rootFilter, setRootFilter] = useState('');
  // Fila activa: solo esa muestra sus botones (Mover / Editar / Borrar / + Hija).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toggleSelected = (id: string): void => setSelectedId((cur) => (cur === id ? null : id));
  // Nodos plegados (sus hijas no se muestran), recordados en localStorage.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(loadCollapsed);
  useEffect(() => saveCollapsed(collapsedIds), [collapsedIds]);
  const toggleCollapse = (id: string): void =>
    setCollapsedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  // Vista filtrada por la toolbar (no muta el árbol: el reordenado y "Mover a"
  // siguen operando sobre `view`). Una raíz que coincide se muestra entera; si solo
  // coinciden hijas, se muestra la raíz con esas hijas. Búsqueda insensible a
  // mayúsculas y acentos ("indica" encuentra "Índica").
  const q = norm(search);
  const filtered = view
    .filter((root) => !rootFilter || root.id === rootFilter)
    .map((root) => {
      if (!q || norm(root.name).includes(q)) return root;
      const kids = root.children.filter((c) => norm(c.name).includes(q));
      return kids.length ? { ...root, children: kids } : null;
    })
    .filter((n): n is FamilyNode => n != null);

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
        ? updateFamily(f.id, { name: f.name, isArchetype: f.isArchetype })
        : createFamily({ name: f.name, parentId: f.parentId, isArchetype: f.isArchetype }),
    onSuccess: (saved, f) => {
      setTree((prev) => {
        const base = prev ?? view;
        if (f.id) {
          // Renombrar / actualizar el flag de arquetipo a cualquier profundidad.
          const rename = (list: FamilyNode[]): FamilyNode[] =>
            list.map((n) =>
              n.id === f.id
                ? { ...n, name: f.name, isArchetype: f.isArchetype }
                : { ...n, children: rename(n.children) },
            );
          return rename(base);
        }
        const node: FamilyNode = { ...saved, children: [] };
        return f.parentId ? insertChild(base, f.parentId, node) : [...base, node];
      });
      setForm(null);
      invalidate();
    },
  });

  const delMut = useMutation({ mutationFn: (id: string) => deleteFamily(id) });

  // Persistir el nuevo orden de hermanos (sortOrder) tras un reordenado por arrastre.
  const reorderMut = useMutation({
    mutationFn: (changes: { id: string; sortOrder: number }[]) =>
      Promise.all(changes.map((c) => updateFamily(c.id, { sortOrder: c.sortOrder }))),
    onSuccess: invalidate,
  });
  // Persistir el nuevo padre y posición final tras "Mover bajo…".
  const moveMut = useMutation({
    mutationFn: (v: { id: string; parentId: string; sortOrder: number }) =>
      updateFamily(v.id, { parentId: v.parentId, sortOrder: v.sortOrder }),
    onSuccess: invalidate,
  });

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
    const base = tree ?? view;
    const next = renumberSiblings(
      reorderSiblings(base, target.parentId, from.id, target.id, position),
      target.parentId,
    );
    setTree(next);
    // Persistir solo los hermanos cuyo sortOrder ha cambiado.
    const siblings =
      target.parentId === null ? next : (findNode(next, target.parentId)?.children ?? []);
    const changes = siblings
      .map((n) => ({ id: n.id, sortOrder: n.sortOrder }))
      .filter((c) => findNode(base, c.id)?.sortOrder !== c.sortOrder);
    if (changes.length) reorderMut.mutate(changes);
    clearDrag();
  };

  const onMoveTo = (childId: string, toParentId: string): void => {
    const base = tree ?? view;
    const next = moveToParent(base, childId, toParentId);
    if (next === base) return; // movimiento inválido (ciclo o nodo inexistente)
    setTree(next);
    // El nodo movido queda como último hijo del nuevo padre.
    const siblings = findNode(next, toParentId)?.children ?? [];
    moveMut.mutate({
      id: childId,
      parentId: toParentId,
      sortOrder: Math.max(0, siblings.length - 1),
    });
  };

  const onDelete = async (node: FamilyNode): Promise<void> => {
    const n = countDescendants(node);
    if (n > 0) {
      const ok = await confirm({
        title: 'Borrar familia',
        message: `"${node.name}" tiene ${n} subnivel(es). ¿Borrar todo el grupo?`,
        confirmLabel: 'Borrar',
        danger: true,
      });
      if (!ok) return;
    }
    delMut.mutate(node.id);
    setTree((prev) => removeNode(prev ?? view, node.id));
    setSelectedId(null);
  };

  const actions: RowActions = {
    roots: view,
    selectedId,
    onSelect: toggleSelected,
    // Al buscar se ignora el plegado para que las coincidencias siempre se vean.
    collapsedIds: q ? EMPTY_COLLAPSE : collapsedIds,
    onToggleCollapse: toggleCollapse,
    dragId: dragNode?.id ?? null,
    dropTarget,
    onDragStart: setDragNode,
    onDragEnd: clearDrag,
    canDropOn,
    onDragOver,
    onDrop,
    onMoveTo,
    onEdit: (node) =>
      setForm({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        isArchetype: node.isArchetype,
        hasChildren: node.children.length > 0,
      }),
    onAddChild: (parentId) =>
      setForm({ name: '', parentId, isArchetype: false, hasChildren: false }),
    onDelete,
  };

  usePageHeader('Familias', 'Organiza el catálogo en familias, subfamilias y arquetipos');

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="table-toolbar">
          <div className="sales-filters">
            <span className="search-field">
              <input
                className="catalog-search"
                placeholder="Buscar familia…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="fam-search"
              />
            </span>
            <Select
              className="catalog-search"
              value={rootFilter}
              onChange={setRootFilter}
              ariaLabel="Filtrar por familia"
              data-testid="fam-filter"
              options={[
                { value: '', label: 'Todas las familias' },
                ...view.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>
          <button
            className="btn-primary"
            onClick={() =>
              setForm({ name: '', parentId: null, isArchetype: false, hasChildren: false })
            }
            data-testid="new-family"
          >
            Nueva familia
          </button>
        </div>

        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : view.length === 0 ? (
          <p className="catalog-empty" data-testid="families-empty">
            Sin familias. Crea la primera.
          </p>
        ) : filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="fam-empty">
            Sin familias para la búsqueda.
          </p>
        ) : (
          <div className="fam-tree" data-testid="fam-tree" ref={treeRef}>
            {filtered.map((n) => (
              <FamilyRow key={n.id} node={n} depth={0} parentId={null} actions={actions} />
            ))}
          </div>
        )}
      </div>

      {form && (
        <Modal
          onClose={() => setForm(null)}
          className="modal--form"
          testId="family-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate(form);
          }}
        >
          <h3>{form.id ? 'Editar familia' : form.parentId ? 'Nuevo subnivel' : 'Nueva familia'}</h3>
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
          <label className="fam-archetype-toggle">
            <input
              type="checkbox"
              checked={form.isArchetype}
              disabled={form.hasChildren}
              onChange={(e) => setForm({ ...form, isArchetype: e.target.checked })}
              data-testid="family-archetype"
            />
            <span>Es un arquetipo (agrupa productos casi idénticos; no admite subniveles)</span>
          </label>
          {form.hasChildren && (
            <p className="muted">Tiene subniveles: vacíalos para poder convertirlo en arquetipo.</p>
          )}
          {saveMut.isError && (
            <p className="form-error">{formErrorMessage(saveMut.error, 'No se pudo guardar.')}</p>
          )}
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
        </Modal>
      )}
    </section>
  );
}
