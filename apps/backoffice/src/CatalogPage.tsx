import type { Rotation } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { CatalogFacets } from './catalog/CatalogFacets.js';
import { CatalogGroupedTable } from './catalog/CatalogGroupedTable.js';
import { CatalogSelectionBar } from './catalog/CatalogSelectionBar.js';
import {
  applyFilters,
  buildRows,
  type CatalogFilters,
  computeFacets,
  EMPTY_FILTERS,
  groupRows,
  type SavedView,
  type StockMeta,
  type StockState,
} from './catalog/facets.js';
import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import {
  EMPTY_PRODUCT_FORM,
  ProductFormModal,
  type ProductFormState,
} from './components/ProductFormModal.js';
import { ProductMovements } from './components/ProductMovements.js';
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

// Alterna una clave en un Set de forma inmutable.
function toggleInSet<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

interface CatalogPageProps {
  initialFamilyId?: string | null;
  search?: string;
  onSearchChange?: (value: string) => void;
  familyFilter?: string;
  onFamilyFilterChange?: (value: string) => void;
  /** Nodo DOM (fuera del card de productos) donde se portaliza la barra de selección, para
   *  que al aparecer reduzca la altura del card en vez de vivir dentro de él. */
  selectionBarHost?: HTMLElement | null;
}

export function CatalogPage({
  initialFamilyId,
  search: searchProp,
  onSearchChange,
  familyFilter: familyFilterProp,
  selectionBarHost,
}: CatalogPageProps = {}) {
  const qc = useQueryClient();
  // Modo controlado: si el shell de Inventario provee `search`, ese valor manda.
  const controlled = searchProp !== undefined;
  const [searchInner, setSearchInner] = useState('');
  const search = controlled ? searchProp : searchInner;
  const setSearch = controlled ? (onSearchChange ?? (() => {})) : setSearchInner;
  // Deep-link de familia (`?family=` o prop autónoma): acota el catálogo a ese nodo y su subárbol.
  const familyFilter = controlled ? (familyFilterProp ?? '') : (initialFamilyId ?? '');

  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [form, setForm] = useState<FormState | null>(null);
  const [wizard, setWizard] = useState<EditWizard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);

  usePageHeader('Catálogo');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search),
  });

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  // Stock total + rotación por producto (suma de todas las tiendas) para tabla y facetas.
  const { data: stockRows = [] } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });
  const stockMeta = useMemo<Map<string, StockMeta>>(
    () => new Map(stockRows.map((r) => [r.productId, { total: r.total, rotation: r.rotation }])),
    [stockRows],
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['products'] });

  // Deep-link de familia: el catálogo se limita al nodo elegido y su subárbol.
  const scopedProducts = useMemo<Product[]>(
    () =>
      familyFilter
        ? products.filter(
            (p) => p.familyId != null && isDescendantOf(families, familyFilter, p.familyId),
          )
        : products,
    [products, familyFilter, families],
  );

  // Filas enriquecidas → recuentos de facetas → filas mostradas → grupos.
  const rows = useMemo(
    () => buildRows(scopedProducts, families, stockMeta),
    [scopedProducts, families, stockMeta],
  );
  const facets = useMemo(() => computeFacets(rows, families), [rows, families]);
  const displayedRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const groups = useMemo(() => groupRows(displayedRows, families), [displayedRows, families]);

  const archetypeOptions = useMemo(
    () =>
      flattenTree(families).map((f) => ({
        value: f.node.id,
        label: `${'– '.repeat(f.depth)}${f.node.name}`,
      })),
    [families],
  );

  // Exportación del catálogo: cabeceras + filas (las mostradas) para el modal.
  const exportHeaders = ['Nombre', 'SKU', 'EAN', 'Familia', 'PVP', 'Coste', 'Stock'];
  const buildExportRows = (): string[][] =>
    displayedRows.map((row) => [
      row.product.name,
      row.product.sku ?? '',
      row.product.barcode ?? '',
      familyPathLabel(families, row.product.familyId),
      fmtEur(Number(row.product.salePrice)),
      fmtEur(Number(row.product.costPrice)),
      String(row.stock),
    ]);

  // ─── Filtros de faceta ─────────────────────────────────────────────────
  const setView = (view: SavedView): void => setFilters((f) => ({ ...f, view }));
  const toggleFamily = (id: string): void =>
    setFilters((f) => ({ ...f, families: toggleInSet(f.families, id) }));
  const toggleState = (state: StockState): void =>
    setFilters((f) => ({ ...f, states: toggleInSet(f.states, state) }));
  const toggleRotation = (rotation: Rotation): void =>
    setFilters((f) => ({ ...f, rotations: toggleInSet(f.rotations, rotation) }));

  // ─── Selección ─────────────────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggleSelect = (id: string): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearSelection = (): void => setSelected([]);

  const displayedProducts = useMemo(() => displayedRows.map((r) => r.product), [displayedRows]);
  const selectedProducts = useMemo(
    () => displayedProducts.filter((p) => selectedSet.has(p.id)),
    [displayedProducts, selectedSet],
  );

  // ─── Mutaciones (persistencia real; la tabla se refresca por invalidate) ──
  const createMut = useMutation({
    mutationFn: (f: FormState) => createProduct(toPayload(f)),
    onSuccess: () => {
      closeModal();
      invalidate();
    },
  });

  const applyEdit = (f: FormState): void => {
    if (!f.id) return;
    void updateProduct(f.id, toPayload(f)).then(invalidate);
  };

  const removeSelected = (): void => {
    void Promise.all(selected.map((id) => deleteProduct(id))).then(invalidate);
    clearSelection();
  };

  // Mueve los productos seleccionados a una familia (un updateProduct por id; la tabla se
  // refresca por invalidate). Persistencia real, igual que el resto de mutaciones.
  const moveSelectedToFamily = (familyId: string): void => {
    void Promise.all(selected.map((id) => updateProduct(id, { familyId }))).then(invalidate);
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

  // El clic de FILA abre el detalle/edición del producto (la selección queda en el checkbox).
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
      applyEdit(form);
      closeModal();
    } else {
      createMut.mutate(form);
    }
  };

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

  // Toolbar de la card (en el slot de cabecera del shell): acciones de selección o el CTA.
  // CTA fijo del slot de la TopBar. Las acciones de selección (editar/mover/borrar/cancelar)
  // ya NO viven aquí: se montan en la barra flotante CatalogSelectionBar (abajo-centro) cuando
  // hay productos seleccionados.
  const toolbar = (
    <Button
      onClick={openCreate}
      data-testid="new-product"
      icon={<Plus size={16} aria-hidden="true" />}
    >
      Nuevo producto
    </Button>
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
      {toolbar}
    </>,
  );

  return (
    <section className="catalog catalog--faceted">
      <div className="cat-layout">
        <CatalogFacets
          facets={facets}
          filters={filters}
          onView={setView}
          onToggleFamily={toggleFamily}
          onToggleState={toggleState}
          onToggleRotation={toggleRotation}
          search={search}
          onSearchChange={setSearch}
        />
        <CatalogGroupedTable
          groups={groups}
          selected={selectedSet}
          onToggleSelect={toggleSelect}
          onRowClick={openEdit}
          empty={
            <span data-testid="catalog-empty">
              {isLoading
                ? 'Cargando…'
                : products.length === 0
                  ? 'Sin productos. Crea el primero.'
                  : 'Sin productos para los filtros seleccionados.'}
            </span>
          }
        />
      </div>

      {/* La barra de selección se portaliza FUERA del card de productos (a `selectionBarHost`, un
          hermano de .inv-card dentro de .inventory-page). Así, al aparecer, el slot reduce la
          altura del card (flex) en vez de vivir dentro de él. El slot reserva el alto y revela la
          barra (grid-rows 0fr→1fr + slide); se mantiene montada para animar también la salida. */}
      {selectionBarHost &&
        createPortal(
          <div className={`cat-selbar-slot${selected.length > 0 ? ' is-open' : ''}`}>
            <div className="cat-selbar-slot__inner">
              <CatalogSelectionBar
                count={selected.length}
                familyOptions={archetypeOptions}
                onEdit={openBulkEdit}
                onMoveFamily={moveSelectedToFamily}
                onDelete={removeSelected}
                onCancel={clearSelection}
              />
            </div>
          </div>,
          selectionBarHost,
        )}

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
