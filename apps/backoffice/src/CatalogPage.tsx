import { DataTable, type DataTableColumn, type DataTableSort, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { CsvDropzone } from './components/CsvDropzone.js';
import { Modal } from './components/Modal.js';
import {
  EMPTY_PRODUCT_FORM,
  ProductFormModal,
  type ProductFormState,
} from './components/ProductFormModal.js';
import { useTableColumns } from './components/useTableColumns.js';
import { type FamilyNode, listFamilies } from './lib/families.js';
import { findNodePath, flattenTree, isDescendantOf } from './lib/family-tree.js';
import { formErrorMessage } from './lib/form-error.js';
import { fmtEur } from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';
import {
  createProduct,
  deleteProduct,
  importProductsCsv,
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

// Margen sobre PVP: (PVP − coste) / PVP en %. '—' si no hay PVP.
const marginPct = (sale: number, cost: number): string =>
  sale > 0 ? `${Math.round(((sale - cost) / sale) * 100)}%` : '—';

type FormState = ProductFormState;

// Asistente de edición en lote: cola de productos seleccionados + paso actual.
interface EditWizard {
  queue: Product[];
  step: number;
}

const EMPTY: FormState = EMPTY_PRODUCT_FORM;

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

export function CatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<EditWizard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Modal de importación de catálogo por CSV (POST /products/import).
  const [importing, setImporting] = useState(false);
  // Orden y paginación cliente del DataTable (D-04).
  const [sort, setSort] = useState<DataTableSort | undefined>(undefined);
  const [page, setPage] = useState(1);

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

  const allProducts = products;

  const archetypeOptions = useMemo(
    () =>
      flattenTree(families).map((f) => ({
        value: f.node.id,
        label: `${'– '.repeat(f.depth)}${f.node.name}`,
      })),
    [families],
  );

  // Filtro por familia: el nodo elegido y todo su subárbol (la búsqueda por
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

  // Orden cliente (numérico para precios/margen/stock; texto para el resto).
  const sortValue = (p: Product, key: string): number | string => {
    switch (key) {
      case 'salePrice':
        return Number(p.salePrice);
      case 'costPrice':
        return Number(p.costPrice);
      case 'margin':
        return Number(p.salePrice) - Number(p.costPrice);
      case 'stock':
        return stockByProduct.get(p.id) ?? 0;
      case 'family':
        return familyPathLabel(families, p.familyId);
      default:
        return p.name.toLocaleLowerCase();
    }
  };
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, families, stockByProduct]);

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const onSortChange = (key: string): void => {
    setSort((cur) =>
      cur?.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
    setPage(1);
  };

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

  // ─── Mutaciones (persistencia real; la tabla se refresca por invalidate) ──
  const createMut = useMutation({
    mutationFn: (f: FormState) => createProduct(toPayload(f)),
    onSuccess: () => {
      closeModal();
      invalidate();
    },
  });

  // Edita un producto existente; el refetch tras invalidate refleja el cambio.
  const applyEdit = (f: FormState): void => {
    if (!f.id) return;
    void updateProduct(f.id, toPayload(f)).then(invalidate);
  };

  // Borrado en lote: se refresca cuando terminan todos los DELETE.
  const removeSelected = (): void => {
    void Promise.all(selected.map((id) => deleteProduct(id))).then(invalidate);
    clearSelection();
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

  // Columnas de datos (la de selección va aparte, siempre visible). Defaults D-12:
  // visibles Nombre · Familia · PVP · Margen · Stock; ocultas SKU · Coste · IVA.
  const dataColumns: DataTableColumn<Product>[] = [
    { key: 'name', header: 'Nombre', sortable: true },
    {
      key: 'family',
      header: 'Familia',
      render: (p) => (
        <span className="muted" data-testid="catalog-family">
          {familyPathLabel(families, p.familyId)}
        </span>
      ),
    },
    { key: 'sku', header: 'SKU', render: (p) => <span className="muted">{p.sku ?? '—'}</span> },
    {
      key: 'costPrice',
      header: 'Coste',
      align: 'right',
      sortable: true,
      render: (p) => <span className="muted">{fmtEur(Number(p.costPrice))}</span>,
    },
    {
      key: 'salePrice',
      header: 'PVP',
      align: 'right',
      sortable: true,
      render: (p) => fmtEur(Number(p.salePrice)),
    },
    {
      key: 'margin',
      header: 'Margen',
      align: 'right',
      sortable: true,
      render: (p) => (
        <span data-testid="catalog-margin">
          {fmtEur(Number(p.salePrice) - Number(p.costPrice))}
          <span className="muted">
            {' · '}
            {marginPct(Number(p.salePrice), Number(p.costPrice))}
          </span>
        </span>
      ),
    },
    {
      key: 'taxRate',
      header: 'IVA',
      align: 'right',
      render: (p) => <span className="muted">{Number(p.taxRate).toFixed(0)}%</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (p) => {
        const qty = stockByProduct.get(p.id) ?? 0;
        return (
          <span className={`stock-tag stock-${stockLevel(qty)}`} data-testid="catalog-stock">
            {qty}
          </span>
        );
      },
    },
  ];
  const {
    effectiveColumns,
    editor: columnsEditor,
    editorOpen: columnsEditorOpen,
    toggleEditor: toggleColumnsEditor,
  } = useTableColumns('table.catalog.columns', dataColumns, {
    defaultHidden: ['sku', 'costPrice', 'taxRate'],
    editorTestId: 'catalog-columns-editor',
    title: 'Columnas del catálogo',
  });
  // Columna de selección múltiple: fija, fuera de la configuración.
  const selectColumn: DataTableColumn<Product> = {
    key: 'select',
    header: '',
    width: '2.2rem',
    render: (p) => (
      <input
        type="checkbox"
        className="user-check"
        aria-label={`Seleccionar ${p.name}`}
        data-testid="product-select"
        checked={selectedSet.has(p.id)}
        onChange={() => toggleSelect(p.id)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
  const tableColumns = [selectColumn, ...effectiveColumns];

  const toolbar = (
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
          ariaLabel="Filtrar por familia"
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
        <div className="users-toolbar-actions">
          <button
            type="button"
            className="users-sel-btn"
            onClick={() => setImporting(true)}
            data-testid="catalog-import"
          >
            Importar CSV
          </button>
          <button className="btn-primary" onClick={openCreate} data-testid="new-product">
            Nuevo producto
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section className="catalog">
      <div className="table-panel">
        {toolbar}
        <div className="config-bar">
          <button
            type="button"
            className="config-trigger"
            onClick={toggleColumnsEditor}
            data-testid="catalog-columns-toggle"
            aria-expanded={columnsEditorOpen}
          >
            Columnas
          </button>
        </div>
        {columnsEditor}
        <DataTable
          columns={tableColumns}
          rows={pageRows}
          rowKey={(p) => p.id}
          loading={isLoading}
          {...(sort ? { sort } : {})}
          onSortChange={onSortChange}
          onRowClick={(p) => toggleSelect(p.id)}
          rowClassName={(p) => (selectedSet.has(p.id) ? 'is-selected' : undefined)}
          rowAriaSelected={(p) => selectedSet.has(p.id)}
          pagination={{
            page: safePage,
            pageSize: PAGE_SIZE,
            totalItems: sorted.length,
            onPageChange: setPage,
          }}
          emptyState={
            <span data-testid="catalog-empty">
              {allProducts.length === 0
                ? 'Sin productos. Crea el primero.'
                : 'Sin productos para los filtros seleccionados.'}
            </span>
          }
          data-testid="catalog-table"
        />
      </div>

      {form && (
        <ProductFormModal
          form={form}
          onChange={setForm}
          onSubmit={submitForm}
          onClose={closeModal}
          familyOptions={archetypeOptions}
          pending={createMut.isPending}
          errorMessage={
            createMut.isError ? formErrorMessage(createMut.error, 'No se pudo guardar.') : null
          }
          title={wizard ? 'Editar producto' : 'Nuevo producto'}
          primaryLabel={primaryLabel}
        />
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="catalog-import-modal"
          ariaLabel="Importar catálogo desde CSV"
        >
          <h3>Importar catálogo desde CSV</h3>
          <CsvDropzone
            columns={['name', 'salePrice', 'sku', 'barcode']}
            example={['Producto ejemplo', '9.99', 'SKU-001', '8412345678901']}
            templateName="plantilla_catalogo.csv"
            testId="catalog-csv"
            help={
              <>
                Columnas: <code>name,salePrice,sku,barcode</code>. Solo <code>name</code> y{' '}
                <code>salePrice</code> son obligatorios.
              </>
            }
            onImport={importProductsCsv}
            onImported={invalidate}
          />
          <div className="modal-foot">
            <button type="button" onClick={() => setImporting(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
