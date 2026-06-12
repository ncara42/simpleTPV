import { Chart, DataTable, type DataTableColumn, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { useTableColumns } from '../components/useTableColumns.js';
import { listFamilies } from '../lib/families.js';
import { flattenTree } from '../lib/family-tree.js';
import { formErrorMessage } from '../lib/form-error.js';
import { fmtEur } from '../lib/format.js';
import { readPref, usePreferences } from '../lib/preferences.js';
import { listProducts } from '../lib/products.js';
import { listSuppliers } from '../lib/purchases.js';
import {
  compareSupplierPrices,
  deleteSupplierPrice,
  importSupplierPricesCsv,
  listSupplierPrices,
  upsertSupplierPrice,
} from '../lib/supplier-prices.js';

// Tarifas de compra por proveedor (P1-B): alta/edición de precio por producto,
// import CSV por SKU y comparativa de precios entre proveedores por arquetipo.
// Con `fixedSupplierId` (vista detalle de proveedor, I-18/D-07) se fija el
// proveedor y se ocultan el selector y la comparativa (que es cross-proveedor).
export function SupplierPricesSection({ fixedSupplierId }: { fixedSupplierId?: string } = {}) {
  const qc = useQueryClient();
  const [view, setView] = useState<'tarifas' | 'comparativa'>('tarifas');
  const [supplierId, setSupplierId] = useState(fixedSupplierId ?? '');
  const [familyId, setFamilyId] = useState('');
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | undefined>(undefined);
  const [addProduct, setAddProduct] = useState('');
  const [addPrice, setAddPrice] = useState('');

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: listFamilies });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });
  const { data: prices = [], isLoading: pricesLoading } = useQuery({
    queryKey: ['supplier-prices', supplierId || null],
    queryFn: () => listSupplierPrices(supplierId || undefined),
  });
  const { data: comparison = [], isLoading: comparisonLoading } = useQuery({
    queryKey: ['supplier-comparison', familyId || null],
    queryFn: () => compareSupplierPrices(familyId || undefined),
    enabled: view === 'comparativa',
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['supplier-prices'] });
    void qc.invalidateQueries({ queryKey: ['supplier-comparison'] });
  };

  const upsertMut = useMutation({
    mutationFn: upsertSupplierPrice,
    onSuccess: () => {
      setAdding(false);
      setAddProduct('');
      setAddPrice('');
      invalidate();
    },
  });
  const deleteMut = useMutation({ mutationFn: deleteSupplierPrice, onSuccess: invalidate });

  const supplierName = (id: string): string => suppliers.find((s) => s.id === id)?.name ?? '—';

  // Columnas del DataTable de tarifas (D-12: Producto · SKU · Precio; Proveedor
  // visible y ocultable). La acción Borrar va fija.
  type PriceRow = (typeof prices)[number];
  const dataColumns: DataTableColumn<PriceRow>[] = [
    { key: 'product', header: 'Producto', sortable: true, render: (r) => r.productName },
    { key: 'sku', header: 'SKU', render: (r) => <span className="muted">{r.sku ?? '—'}</span> },
    {
      key: 'supplier',
      header: 'Proveedor',
      render: (r) => <span className="muted">{r.supplierName}</span>,
    },
    {
      key: 'price',
      header: 'Precio compra',
      align: 'right',
      sortable: true,
      render: (r) => fmtEur(r.price),
    },
  ];
  const {
    effectiveColumns,
    editor: columnsEditor,
    editorOpen: columnsEditorOpen,
    toggleEditor: toggleColumnsEditor,
  } = useTableColumns('table.supplier-prices.columns', dataColumns, {
    editorTestId: 'sp-columns-editor',
    title: 'Columnas de tarifas',
  });
  const deleteColumn: DataTableColumn<PriceRow> = {
    key: 'actions',
    header: '',
    width: '6rem',
    align: 'right',
    render: (r) => (
      <button
        type="button"
        className="link-btn danger"
        onClick={() => deleteMut.mutate(r.id)}
        data-testid="sp-delete"
      >
        Borrar
      </button>
    ),
  };
  const priceSorted = sort
    ? [...prices].sort((a, b) => {
        const dir = sort.dir === 'desc' ? -1 : 1;
        if (sort.key === 'price') return (a.price - b.price) * dir;
        return a.productName.localeCompare(b.productName) * dir;
      })
    : prices;

  // ── Comparativa gráfica ──
  // El tipo de gráfico (barras/línea) sigue la MISMA preferencia que el
  // dashboard (dashboard.layout.chartKind): un solo toggle para toda la app.
  const { prefs } = usePreferences();
  const chartKind: 'bars' | 'line' =
    readPref<{ chartKind?: 'bars' | 'line' }>(prefs, 'dashboard.layout', {}).chartKind === 'line'
      ? 'line'
      : 'bars';
  // Búsqueda de producto/arquetipo (encima de la tabla) + selección por clic.
  const [cmpSearch, setCmpSearch] = useState('');
  const [cmpProductId, setCmpProductId] = useState<string | null>(null);
  const cmpQuery = cmpSearch.trim().toLowerCase();
  const filteredComparison = cmpQuery
    ? comparison.filter(
        (r) =>
          r.productName.toLowerCase().includes(cmpQuery) ||
          (r.sku ?? '').toLowerCase().includes(cmpQuery),
      )
    : comparison;
  // Fila activa del gráfico de producto: la clicada o, si se está buscando,
  // la primera coincidencia.
  const activeRow =
    (cmpProductId ? comparison.find((r) => r.productId === cmpProductId) : undefined) ??
    (cmpQuery ? filteredComparison[0] : undefined) ??
    null;
  // Media y mediana del precio de compra POR PROVEEDOR sobre las filas visibles
  // (respeta el filtro de arquetipo del toolbar).
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const bySupplier = new Map<string, { name: string; prices: number[] }>();
  for (const row of comparison) {
    for (const pr of row.prices) {
      const entry = bySupplier.get(pr.supplierId) ?? { name: pr.supplierName, prices: [] };
      entry.prices.push(pr.price);
      bySupplier.set(pr.supplierId, entry);
    }
  }
  const cmpStats = [...bySupplier.values()].map((e) => ({
    label: e.name,
    media: e.prices.reduce((a, b) => a + b, 0) / e.prices.length,
    mediana: median(e.prices),
  }));

  // Comparativa: tabla de presentación (sin configuración de columnas).
  type CmpRow = (typeof comparison)[number];
  const comparisonColumns: DataTableColumn<CmpRow>[] = [
    { key: 'product', header: 'Producto', render: (r) => r.productName },
    {
      key: 'prices',
      header: 'Precios por proveedor',
      render: (row) => (
        <span className="sp-price-chips">
          {row.prices.map((pr) => (
            <span
              key={pr.supplierId}
              className={`sp-price-chip${row.best?.supplierId === pr.supplierId ? ' is-best' : ''}`}
            >
              {pr.supplierName}: {fmtEur(pr.price)}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'best',
      header: 'Mejor',
      render: (row) =>
        row.best ? (
          <strong className="sp-best">
            {supplierName(row.best.supplierId)} · {fmtEur(row.best.price)}
          </strong>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="table-panel">
      <div className="table-toolbar">
        {!fixedSupplierId && (
          <nav className="bo-tabs" data-testid="sp-view-tabs">
            <button
              className={`bo-tab ${view === 'tarifas' ? 'active' : ''}`}
              onClick={() => setView('tarifas')}
              data-testid="sp-view-tarifas"
            >
              Tarifas por proveedor
            </button>
            <button
              className={`bo-tab ${view === 'comparativa' ? 'active' : ''}`}
              onClick={() => setView('comparativa')}
              data-testid="sp-view-comparativa"
            >
              Comparativa
            </button>
          </nav>
        )}
        {view === 'tarifas' ? (
          <div className="sales-filters">
            {!fixedSupplierId && (
              <Select
                className="catalog-search"
                value={supplierId}
                onChange={setSupplierId}
                ariaLabel="Proveedor"
                data-testid="sp-supplier"
                options={[
                  { value: '', label: 'Todos los proveedores' },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            )}
            <button
              type="button"
              className="users-sel-btn"
              disabled={!supplierId}
              title={supplierId ? undefined : 'Elige un proveedor para importar su tarifa'}
              onClick={() => setImporting(true)}
              data-testid="sp-import"
            >
              Importar CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!supplierId}
              onClick={() => setAdding(true)}
              data-testid="sp-add"
            >
              Añadir tarifa
            </button>
            {/* Botón Columnas en el MISMO contenedor que el resto de controles. */}
            <div className="ui-dt-cols">
              <button
                type="button"
                className="ui-dt-cols-trigger"
                onClick={toggleColumnsEditor}
                data-testid="sp-columns-toggle"
                aria-expanded={columnsEditorOpen}
              >
                Columnas
              </button>
            </div>
          </div>
        ) : (
          <div className="sales-filters">
            <Select
              className="catalog-search"
              value={familyId}
              onChange={setFamilyId}
              ariaLabel="Arquetipo"
              data-testid="sp-family"
              options={[
                { value: '', label: 'Todos los arquetipos' },
                // Solo nodos ARQUETIPO: la comparativa agrupa productos casi
                // idénticos; filtrar por una familia raíz no casa con el árbol
                // canónico (los comparables cuelgan de arquetipos hoja).
                ...flattenTree(families)
                  .filter((f) => f.node.isArchetype)
                  .map((f) => ({ value: f.node.id, label: f.node.name })),
              ]}
            />
          </div>
        )}
      </div>

      {view === 'tarifas' ? (
        <>
          {columnsEditor}
          <DataTable
            columns={[...effectiveColumns, deleteColumn]}
            rows={priceSorted}
            rowKey={(r) => r.id}
            loading={pricesLoading}
            {...(sort ? { sort } : {})}
            onSortChange={(key) =>
              setSort((cur) =>
                cur?.key === key
                  ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
                  : { key, dir: 'asc' },
              )
            }
            rowTestId="sp-row"
            emptyState={
              <span data-testid="sp-empty">Sin tarifas. Añade una o impórtalas por CSV.</span>
            }
            data-testid="sp-table"
          />
        </>
      ) : (
        <>
          {/* Comparativa gráfica: media/mediana por proveedor + producto concreto.
              Los gráficos responden al toggle barras↔línea del dashboard. */}
          <div className="sp-cmp-charts">
            <div className="sp-cmp-panel" data-testid="sp-cmp-avg">
              <h3>Media y mediana por proveedor</h3>
              {cmpStats.length === 0 ? (
                <p className="catalog-empty">Sin tarifas que comparar.</p>
              ) : (
                <>
                  <Chart
                    data={cmpStats.map((s) => ({
                      label: s.label,
                      value: s.media,
                      compareValue: s.mediana,
                      valueText: `Media ${fmtEur(s.media)}`,
                      compareText: `Mediana ${fmtEur(s.mediana)}`,
                    }))}
                    height={190}
                    formatValue={fmtEur}
                    kind={chartKind}
                    ariaLabel="Precio medio y mediana por proveedor"
                  />
                  <div className="sp-cmp-legend">
                    <span>
                      <i className="sp-cmp-dot is-media" aria-hidden="true" /> Media
                    </span>
                    <span>
                      <i className="sp-cmp-dot is-mediana" aria-hidden="true" /> Mediana
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="sp-cmp-panel" data-testid="sp-cmp-product">
              <h3>
                {activeRow ? `Comparativa · ${activeRow.productName}` : 'Comparar un producto'}
              </h3>
              {activeRow ? (
                <Chart
                  data={activeRow.prices.map((pr) => ({
                    label: pr.supplierName,
                    value: pr.price,
                  }))}
                  height={190}
                  formatValue={fmtEur}
                  kind={chartKind}
                  ariaLabel={`Precios de ${activeRow.productName} por proveedor`}
                />
              ) : (
                <p className="catalog-empty">
                  Busca un producto o arquetipo (o pulsa una fila de la tabla) para comparar sus
                  precios entre proveedores.
                </p>
              )}
            </div>
          </div>
          <DataTable
            columns={comparisonColumns}
            rows={filteredComparison}
            rowKey={(r) => r.productId}
            loading={comparisonLoading}
            toolbar={
              <div className="sales-filters">
                <span className="search-field">
                  <input
                    className="catalog-search"
                    placeholder="Buscar producto o arquetipo…"
                    value={cmpSearch}
                    onChange={(e) => {
                      setCmpSearch(e.target.value);
                      setCmpProductId(null);
                    }}
                    data-testid="sp-cmp-search"
                  />
                </span>
              </div>
            }
            onRowClick={(r) => setCmpProductId(r.productId)}
            rowClassName={(r) => (r.productId === activeRow?.productId ? 'is-selected' : undefined)}
            rowAriaSelected={(r) => r.productId === activeRow?.productId}
            rowTestId="sp-comparison-row"
            emptyState={
              <span data-testid="sp-comparison-empty">
                Sin tarifas que comparar para este arquetipo.
              </span>
            }
            data-testid="sp-comparison-table"
          />
        </>
      )}

      {adding && (
        <Modal
          onClose={() => setAdding(false)}
          className="modal--form"
          testId="sp-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!supplierId || !addProduct || !addPrice) return;
            upsertMut.mutate({
              supplierId,
              productId: addProduct,
              price: Number(addPrice),
            });
          }}
        >
          <h3>Añadir tarifa · {supplierName(supplierId)}</h3>
          <label>
            Producto
            <Select
              value={addProduct}
              onChange={setAddProduct}
              ariaLabel="Producto"
              data-testid="sp-add-product"
              options={[
                { value: '', label: 'Selecciona…' },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
          <label>
            Precio de compra (€)
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              data-testid="sp-add-price"
            />
          </label>
          {upsertMut.isError && (
            <p className="form-error">
              {formErrorMessage(upsertMut.error, 'No se pudo guardar la tarifa.')}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!addProduct || !addPrice || upsertMut.isPending}
              data-testid="sp-add-save"
            >
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="sp-import-modal"
          ariaLabel="Importar tarifa desde CSV"
        >
          <h3>Importar tarifa · {supplierName(supplierId)}</h3>
          <CsvDropzone
            columns={['sku', 'price']}
            example={['SKU-001', '3.50']}
            templateName="plantilla_tarifa_proveedor.csv"
            testId="sp-csv"
            help={
              <>
                Columnas: <code>sku,price</code>. Cada fila fija el precio de compra del producto
                con ese SKU para <strong>{supplierName(supplierId)}</strong>.
              </>
            }
            onImport={(csv) => importSupplierPricesCsv(supplierId, csv)}
            onImported={invalidate}
          />
          <div className="modal-foot">
            <button type="button" onClick={() => setImporting(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
