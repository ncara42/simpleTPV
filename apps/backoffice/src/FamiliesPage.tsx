import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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

function FamilyRow({
  node,
  depth,
  onEdit,
  onAddChild,
  onDelete,
}: {
  node: FamilyNode;
  depth: number;
  onEdit: (n: FamilyNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div
        className="fam-row"
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        data-testid="fam-row"
      >
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
          <button onClick={() => onAddChild(node.id)}>+ Hija</button>
          <button onClick={() => onEdit(node)}>Editar</button>
          <button className="danger" onClick={() => onDelete(node.id)}>
            Borrar
          </button>
        </span>
      </div>
      {node.children.map((c) => (
        <FamilyRow
          key={c.id}
          node={c}
          depth={depth + 1}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

export function FamiliesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['families'] });

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      f.id
        ? updateFamily(f.id, { name: f.name })
        : createFamily({ name: f.name, parentId: f.parentId }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFamily(id),
    onSuccess: invalidate,
  });

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Familias</h2>
          <p className="catalog-sub">Estructura de catálogo · 2 niveles</p>
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
      ) : tree.length === 0 ? (
        <p className="catalog-empty" data-testid="families-empty">
          Sin familias. Crea la primera.
        </p>
      ) : (
        <div className="fam-tree" data-testid="fam-tree">
          {tree.map((n) => (
            <FamilyRow
              key={n.id}
              node={n}
              depth={0}
              onEdit={(node) => setForm({ id: node.id, name: node.name, parentId: node.parentId })}
              onAddChild={(parentId) => setForm({ name: '', parentId })}
              onDelete={(id) => delMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="modal"
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
