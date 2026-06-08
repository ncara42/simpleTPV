import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Modal } from './components/Modal.js';
import { type FamilyNode, listFamilies } from './lib/families.js';
import { findNodePath, flattenTree, isDescendantOf } from './lib/family-tree.js';
import { usePageHeader } from './lib/pageHeader.js';
import {
  createProduct,
  deleteProduct,
  listProducts,
  type Product,
  type ProductInput,
  updateProduct,
} from './lib/products.js';
import { getGlobalStock } from './lib/stock.js';

function familyPathLabel(families: FamilyNode[], id: string | null): string {
  if (!id) return '—';
  const path = findNodePath(families, id);
  return path.length ? path.map((n) => n.name).join(' › ') : '—';
}

function stockLevel(qty: number): 'red' | 'yellow' | 'green' {
  if (qty === 0) return 'red';
  if (qty <= 5) return 'yellow';
  return 'green';
}

interface FormState {
  id?: string;
  name: string;
  salePrice: number;
  sku: string | null;
  barcode: string | null;
  costPrice: number;
  taxRate: number;
  // Arquetipo efectivo del producto: el id del nodo elegido en el selector
  // jerárquico, a cualquier profundidad (raíz, sub o sub-sub…).
  familyId: string | null;
}

// Asistente de edición en lote: cola de productos seleccionados + paso actual.
interface EditWizard {
  queue: Product[];
  step: number;
}

const EMPTY: FormState = {
  name: '',
  salePrice: 0,
  sku: '',
  barcode: '',
  costPrice: 0,
  taxRate: 21,
  familyId: null,
};

function toForm(p: Product): FormState {
  return {
    id: p.id,
    name: p.name,
    salePrice: Number(p.salePrice),
    sku: p.sku,
    barcode: p.barcode,
    costPrice: Number(p.costPrice),
    taxRate: Number(p.taxRate),
    familyId: p.familyId,
  };
}

function toPayload(f: FormState): ProductInput {
  return {
    name: f.name,
    salePrice: Number(f.salePrice),
    sku: f.sku || null,
    barcode: f.barcode || null,
    costPrice: Number(f.costPrice ?? 0),
    taxRate: Number(f.taxRate ?? 21),
    familyId: f.familyId,
  };
}

// Parche local (demo: el backend stub no persiste) con los campos editables.
function toPatch(f: FormState): Partial<Product> {
  return {
    name: f.name,
    salePrice: String(f.salePrice),
    sku: f.sku || null,
    barcode: f.barcode || null,
    costPrice: String(f.costPrice ?? 0),
    taxRate: String(f.taxRate ?? 21),
    familyId: f.familyId,
  };
}

export function CatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<EditWizard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Product>>>({});
  const [extras, setExtras] = useState<Product[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search),
  });

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  // Stock total por producto (suma de todas las tiendas) para el tag de la tabla.
  const { data: stockRows = [] } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });
  const stockByProduct = useMemo(
    () => new Map(stockRows.map((r) => [r.productId, r.total])),
    [stockRows],
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['products'] });

  const allProducts = useMemo<Product[]>(() => {
    const base = products.map((p) => ({ ...p, ...overrides[p.id] }));
    return [...base, ...extras].filter((p) => !deleted.includes(p.id));
  }, [products, overrides, extras, deleted]);

  const archetypeOptions = useMemo(
    () =>
      flattenTree(families).map((f) => ({
        value: f.node.id,
        label: `${'– '.repeat(f.depth)}${f.node.name}`,
      })),
    [families],
  );

  // Filtro por arquetipo: el nodo elegido y todo su subárbol (la búsqueda por
  // texto ya la resuelve listProducts).
  const filtered = useMemo<Product[]>(
    () =>
      allProducts.filter(
        (p) =>
          !familyFilter ||
          (p.familyId != null && isDescendantOf(families, familyFilter, p.familyId)),
      ),
    [allProducts, familyFilter, families],
  );

  usePageHeader('Catálogo', `${filtered.length} productos activos`, 'catalog-count');

  // ─── Selección ─────────────────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggleSelect = (id: string): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearSelection = (): void => setSelected([]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedSet.has(p.id));
  const selectAllFiltered = (): void =>
    setSelected((prev) => [...new Set([...prev, ...filtered.map((p) => p.id)])]);

  // Productos seleccionados que siguen existiendo, en el orden de la lista.
  const selectedProducts = useMemo(
    () => filtered.filter((p) => selectedSet.has(p.id)),
    [filtered, selectedSet],
  );

  // ─── Mutaciones / overlays ─────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (f: FormState) => createProduct(toPayload(f)),
    onSuccess: (created) => {
      setExtras((prev) => [...prev, created]);
      closeModal();
      invalidate();
    },
  });

  // Aplica la edición de un producto existente sobre los overlays locales.
  const applyEdit = (f: FormState): void => {
    if (!f.id) return;
    const patch = toPatch(f);
    if (extras.some((p) => p.id === f.id)) {
      setExtras((prev) => prev.map((p) => (p.id === f.id ? { ...p, ...patch } : p)));
    } else {
      setOverrides((prev) => ({ ...prev, [f.id as string]: patch }));
    }
    void updateProduct(f.id, toPayload(f)); // parity con futuro backend
  };

  // Borrado en lote en local (demo: deleteProduct es un stub sin backend).
  const removeSelected = (): void => {
    const ids = new Set(selected);
    const extraIds = new Set(extras.map((e) => e.id));
    setExtras((prev) => prev.filter((p) => !ids.has(p.id)));
    setDeleted((prev) => [...prev, ...selected.filter((id) => !extraIds.has(id))]);
    selected.forEach((id) => void deleteProduct(id));
    clearSelection();
    invalidate();
  };

  // ─── Modal ─────────────────────────────────────────────────────────────
  const closeModal = (): void => {
    setForm(null);
    setWizard(null);
  };

  const openCreate = (): void => {
    setWizard(null);
    setForm({ ...EMPTY });
  };

  const openBulkEdit = (): void => {
    const queue = selectedProducts;
    if (queue.length === 0) return;
    setWizard({ queue, step: 0 });
    setForm(toForm(queue[0]!));
  };

  const submitForm = (): void => {
    if (!form) return;
    if (wizard) {
      applyEdit(form);
      const next = wizard.step + 1;
      if (next < wizard.queue.length) {
        setWizard({ ...wizard, step: next });
        setForm(toForm(wizard.queue[next]!));
      } else {
        closeModal();
        clearSelection();
      }
      invalidate();
    } else {
      createMut.mutate(form);
    }
  };

  // Etiqueta del botón primario: "Siguiente (n / total)" mientras quedan productos
  // en la cola; "Guardar" en el último paso (o en alta/edición única).
  const total = wizard?.queue.length ?? 0;
  const step = wizard?.step ?? 0;
  const isLastStep = !wizard || step + 1 >= total;
  const primaryLabel = !wizard
    ? createMut.isPending
      ? 'Guardando…'
      : 'Crear'
    : total > 1 && !isLastStep
      ? `Siguiente (${step + 1} / ${total})`
      : total > 1
        ? `Guardar (${total} / ${total})`
        : 'Guardar';

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="users-toolbar">
          <div className="sales-filters">
            <span className="search-field">
              <input
                className="catalog-search"
                placeholder="Buscar por nombre, SKU o código…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="catalog-search"
              />
            </span>
            <Select
              className="catalog-search"
              value={familyFilter}
              onChange={setFamilyFilter}
              ariaLabel="Filtrar por arquetipo"
              data-testid="catalog-family-filter"
              options={[{ value: '', label: 'Todos los arquetipos' }, ...archetypeOptions]}
            />
            {selected.length > 0 && (
              <>
                {!allFilteredSelected && (
                  <button
                    type="button"
                    className="users-sel-btn"
                    onClick={selectAllFiltered}
                    data-testid="products-select-all"
                  >
                    Seleccionar todo
                  </button>
                )}
                <button
                  type="button"
                  className="users-sel-btn"
                  onClick={clearSelection}
                  data-testid="products-clear"
                >
                  Quitar selección
                </button>
              </>
            )}
          </div>
          {selected.length > 0 ? (
            <div className="users-toolbar-actions">
              <button
                type="button"
                className="users-bulk-edit"
                onClick={openBulkEdit}
                data-testid="products-edit"
              >
                Editar{selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
              <button
                type="button"
                className="users-bulk-del"
                onClick={removeSelected}
                data-testid="products-delete"
              >
                Borrar{selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={openCreate} data-testid="new-product">
              Nuevo producto
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="catalog-empty">
            {allProducts.length === 0
              ? 'Sin productos. Crea el primero.'
              : 'Sin productos para los filtros seleccionados.'}
          </p>
        ) : (
          <table
            className={`catalog-table users-table${selected.length ? ' has-selection' : ''}`}
            data-testid="catalog-table"
          >
            <thead>
              <tr>
                <th className="users-select-col" aria-label="Selección" />
                <th>Nombre</th>
                <th>Arquetipo</th>
                <th>SKU</th>
                <th>Precio</th>
                <th>IVA</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isSel = selectedSet.has(p.id);
                const qty = stockByProduct.get(p.id) ?? 0;
                return (
                  <tr
                    key={p.id}
                    className={isSel ? 'is-selected' : undefined}
                    aria-selected={isSel}
                    onClick={() => toggleSelect(p.id)}
                    data-testid="product-row"
                  >
                    <td className="users-select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="user-check"
                        aria-label={`Seleccionar ${p.name}`}
                        data-testid="product-select"
                        checked={isSel}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td>{p.name}</td>
                    <td className="muted" data-testid="catalog-family">
                      {familyPathLabel(families, p.familyId)}
                    </td>
                    <td className="muted">{p.sku ?? '—'}</td>
                    <td>{Number(p.salePrice).toFixed(2).replace('.', ',')} €</td>
                    <td className="muted">{Number(p.taxRate).toFixed(0)}%</td>
                    <td>
                      <span
                        className={`stock-tag stock-${stockLevel(qty)}`}
                        data-testid="catalog-stock"
                      >
                        {qty}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal
          onClose={closeModal}
          className="modal--form"
          testId="product-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
        >
          <h3>{wizard ? 'Editar producto' : 'Nuevo producto'}</h3>
          <label>
            Nombre
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="form-name"
            />
          </label>
          <label>
            Arquetipo
            <Select
              value={form.familyId ?? ''}
              onChange={(value) => setForm({ ...form, familyId: value || null })}
              options={[{ value: '', label: '— Sin arquetipo —' }, ...archetypeOptions]}
              ariaLabel="Arquetipo"
              data-testid="form-family"
            />
          </label>
          <div className="modal-row">
            <label>
              Precio venta (€)
              <input
                type="number"
                step="0.01"
                required
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
                data-testid="form-price"
              />
            </label>
            <label>
              IVA (%)
              <input
                type="number"
                step="1"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="modal-row">
            <label>
              SKU
              <input
                value={form.sku ?? ''}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </label>
            <label>
              Código de barras
              <input
                value={form.barcode ?? ''}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </label>
          </div>
          {createMut.isError && <p className="form-error">No se pudo guardar.</p>}
          <div className="modal-foot">
            <button type="button" onClick={closeModal}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMut.isPending}
              data-testid="form-save"
            >
              {primaryLabel}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
