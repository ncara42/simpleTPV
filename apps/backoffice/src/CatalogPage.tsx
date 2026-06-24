import {
  Button,
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  Input,
  Select,
} from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import {
  EMPTY_PRODUCT_FORM,
  ProductFormModal,
  type ProductFormState,
} from './components/ProductFormModal.js';
import { ProductMovements } from './components/ProductMovements.js';
import { useTableColumns } from './components/useTableColumns.js';
import { type FamilyNode, listFamilies } from './lib/families.js';
import { findNodePath, flattenTree, isDescendantOf } from './lib/family-tree.js';
import { formErrorMessage } from './lib/form-error.js';
import { fmtEur } from './lib/format.js';
import { usePageActions } from './lib/pageActions.js';
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

interface CatalogPageProps {
  initialFamilyId?: string | null;
  // S-02 fase C — Filtro COMPARTIDO de Inventario. Cuando el shell pasa estos
  // valores (controlados), la búsqueda y la familia las gobierna `InventoryFilters`
  // arriba del control de vistas; el Catálogo deja de pintar su propia caja
  // (`catalog-search`/`catalog-family-filter`) y consume las props. Sin estas props
  // (uso autónomo / tests), conserva su estado interno y su toolbar de filtros.
  search?: string;
  onSearchChange?: (value: string) => void;
  familyFilter?: string;
  onFamilyFilterChange?: (value: string) => void;
  // Slot de cabecera del shell de Inventario: la toolbar se portalea ahí (no en la card),
  // para que filtros + tabs + filtro compartido vivan en UNA sola línea.
  headerSlot?: HTMLElement | null;
}

export function CatalogPage({
  initialFamilyId,
  search: searchProp,
  onSearchChange,
  familyFilter: familyFilterProp,
  onFamilyFilterChange,
  headerSlot,
}: CatalogPageProps = {}) {
  const qc = useQueryClient();
  // Modo controlado: si el shell de Inventario provee `search`/`familyFilter`, esos
  // valores mandan y los inputs propios no se pintan (los pone `InventoryFilters`).
  const controlled = searchProp !== undefined;
  const [searchInner, setSearchInner] = useState('');
  const [familyFilterInner, setFamilyFilterInner] = useState(initialFamilyId ?? '');
  const search = controlled ? searchProp : searchInner;
  const setSearch = controlled ? (onSearchChange ?? (() => {})) : setSearchInner;
  const familyFilter = controlled ? (familyFilterProp ?? '') : familyFilterInner;
  const setFamilyFilter = controlled ? (onFamilyFilterChange ?? (() => {})) : setFamilyFilterInner;
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<EditWizard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Modal unificado de Importar/Exportar catálogo (B-04): importar por CSV/XLSX
  // (POST /products/import) o exportar las filas filtradas a CSV/Excel.
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
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

  // Exportación del catálogo: cabeceras + filas (filtradas en memoria) para el modal.
  const exportHeaders = ['Nombre', 'SKU', 'EAN', 'Familia', 'PVP', 'Coste', 'Stock'];
  const buildExportRows = (): string[][] =>
    filtered.map((p) => [
      p.name,
      p.sku ?? '',
      p.barcode ?? '',
      familyPathLabel(families, p.familyId),
      fmtEur(Number(p.salePrice)),
      fmtEur(Number(p.costPrice)),
      String(stockByProduct.get(p.id) ?? 0),
    ]);

  // Orden cliente (numérico para precios/margen/stock; texto para el resto).
  const sortValue = useCallback(
    (p: Product, key: string): number | string => {
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
    },
    [families, stockByProduct],
  );
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, sortValue]);

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

  // P124 — El clic de FILA abre el detalle/edición del producto (la selección
  // queda en el checkbox). Reusa el ProductFormModal en modo edición única (sin
  // wizard): `form.id` presente → `submitForm` hace UPDATE, no create.
  const openEdit = (p: Product): void => {
    setWizard(null);
    setForm(toForm(p));
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
    } else if (form.id) {
      // Edición única (clic de fila, P124): persiste el cambio y cierra.
      applyEdit(form);
      closeModal();
    } else {
      createMut.mutate(form);
    }
  };

  // Etiqueta del botón primario: "Siguiente (n / total)" mientras quedan productos
  // en la cola; "Guardar" en el último paso (o en edición única, P124); "Crear" en
  // alta nueva.
  const total = wizard?.queue.length ?? 0;
  const step = wizard?.step ?? 0;
  const isLastStep = !wizard || step + 1 >= total;
  const primaryLabel = !wizard
    ? form?.id
      ? 'Guardar'
      : createMut.isPending
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
      // Se oculta en pantallas estrechas (la ruta de familia es ancha y no es
      // crítica al primer vistazo): así la tabla cabe en ≤4 columnas en móvil.
      hideOnNarrow: true,
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
      noWrap: true,
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
        {/* En modo controlado (shell de Inventario) la búsqueda y la familia las
            pinta `InventoryFilters` arriba; aquí solo quedan las acciones de selección. */}
        {!controlled && (
          <>
            <span className="search-field">
              <Input
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
          </>
        )}
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
        <div className="ui-dt-toolbar-actions">
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
        <div className="ui-dt-toolbar-actions">
          <Button
            onClick={openCreate}
            data-testid="new-product"
            icon={<Plus size={16} aria-hidden="true" />}
          >
            Nuevo producto
          </Button>
        </div>
      )}
    </div>
  );

  usePageActions(
    <>
      <CsvActionButton
        kind="export"
        label="Exportar"
        onClick={() => setDataModal('export')}
        testId="catalog-export"
      />
      <CsvActionButton
        kind="import"
        label="Importar"
        onClick={() => setDataModal('import')}
        testId="catalog-import"
      />
      <button
        type="button"
        className={`float-action-btn${columnsEditorOpen ? ' is-active' : ''}`}
        onClick={toggleColumnsEditor}
        aria-label="Ajustar columnas"
        title="Columnas"
        aria-expanded={columnsEditorOpen}
        data-testid="catalog-columns-toggle"
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
      </button>
    </>,
  );

  return (
    <section className="catalog">
      {headerSlot && createPortal(toolbar, headerSlot)}
      {columnsEditor}

      <div className="table-panel">
        <DataTable
          columns={tableColumns}
          rows={pageRows}
          rowKey={(p) => p.id}
          loading={isLoading}
          toolbar={headerSlot ? undefined : toolbar}
          {...(sort ? { sort } : {})}
          onSortChange={onSortChange}
          onRowClick={(p) => openEdit(p)}
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
          title={wizard || form.id ? 'Editar producto' : 'Nuevo producto'}
          primaryLabel={primaryLabel}
          extraSection={form.id ? <ProductMovements productId={form.id} /> : undefined}
        />
      )}

      {dataModal && (
        <ImportExportModal
          title="Catálogo"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="catalog-import-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'catalogo',
          }}
          importConfig={{
            columns: ['name', 'salePrice', 'sku', 'barcode'],
            example: ['Producto ejemplo', '9.99', 'SKU-001', '8412345678901'],
            templateBase: 'plantilla_catalogo',
            instructions: (
              <>
                Columnas: <code>name,salePrice,sku,barcode</code>. Solo <code>name</code> y{' '}
                <code>salePrice</code> son obligatorios.
              </>
            ),
            onImport: importProductsCsv,
            onImported: invalidate,
          }}
        />
      )}
    </section>
  );
}
