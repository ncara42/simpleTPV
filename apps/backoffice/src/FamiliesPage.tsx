import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { FamilyRow, type RowActions } from './family/FamilyRow.js';
import {
  createFamily,
  deleteFamily,
  type FamilyNode,
  listFamilies,
  updateFamily,
} from './lib/families.js';
import {
  countDescendants,
  moveChild,
  moveRoot,
  moveToParent,
  removeNode,
} from './lib/family-tree.js';

interface FormState {
  id?: string;
  name: string;
  parentId: string | null;
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
