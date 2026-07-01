import type { SupplierPriceRow } from '@simpletpv/auth';
import {
  Button,
  Chart,
  type DataTableColumn,
  type FacetedColumn,
  FacetedTable,
  type FacetSection,
  Input,
  Select,
} from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal, Upload } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { FacetRail } from '../components/FacetRail.js';
import { Modal } from '../components/Modal.js';
import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { useTableColumns } from '../components/useTableColumns.js';
import { listFamilies } from '../lib/families.js';
import { flattenTree } from '../lib/family-tree.js';
import { formErrorMessage } from '../lib/form-error.js';
import { fmtEur } from '../lib/format.js';
import { usePageActions } from '../lib/pageActions.js';
import { listProducts } from '../lib/products.js';
import { listSuppliers } from '../lib/purchases.js';
import {
  compareSupplierPrices,
  deleteSupplierPrice,
  importSupplierPricesCsv,
  listSupplierPrices,
  upsertSupplierPrice,
} from '../lib/supplier-prices.js';
import { useTableShellHeight } from '../lib/useTableShellHeight.js';

// Tarifas de compra por proveedor (P1-B): alta/edición de precio por producto,
// import CSV por SKU y comparativa de precios entre proveedores por arquetipo.
// Con `fixedSupplierId` (vista detalle de proveedor, I-18/D-07) se fija el
// proveedor y se ocultan el selector y la comparativa (que es cross-proveedor).
// `initialView` (S-25): permite arrancar directamente en la sub-vista comparativa
// vía deep-link (?vista=comparativa); por defecto sigue 'tarifas'. No tiene efecto
// con `fixedSupplierId` (en ese modo no hay sub-vistas: la comparativa es cross-proveedor).
export function SupplierPricesSection({
  fixedSupplierId,
  initialView,
}: {
  fixedSupplierId?: string;
  initialView?: 'tarifas' | 'comparativa';
} = {}) {
  const qc = useQueryClient();
  const [view, setView] = useState<'tarifas' | 'comparativa'>(initialView ?? 'tarifas');
  const shellHeight = useTableShellHeight();
  const [supplierId, setSupplierId] = useState(fixedSupplierId ?? '');
  const [familyId, setFamilyId] = useState('');
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  // Búsqueda del carril (por producto/SKU) en la vista de tarifas.
  const [tarifaSearch, setTarifaSearch] = useState('');
  // Proveedores plegados (key = supplierId): cabeceras de grupo plegables.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  // Columnas configurables de la tarifa (D-12: Producto · SKU · Precio). El Proveedor
  // ya no es columna: sube a la cabecera de grupo (la tabla se agrupa por proveedor).
  type PriceRow = SupplierPriceRow;
  const dataColumns: DataTableColumn<PriceRow>[] = [
    { key: 'product', header: 'Producto', render: (r) => r.productName },
    { key: 'sku', header: 'SKU', render: (r) => <span className="muted">{r.sku ?? '—'}</span> },
    {
      key: 'price',
      header: 'Precio compra',
      align: 'right',
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

  // Mapea las columnas efectivas (DataTableColumn del editor) a FacetedColumn: el
  // producto es la columna 'name' (indentada/bold), el precio 'num' (derecha), el
  // resto 'mid'. Cierra con la acción Borrar fija ('num', a la derecha).
  const variantOf = (key: string): 'name' | 'num' | 'mid' =>
    key === 'product' ? 'name' : key === 'price' ? 'num' : 'mid';
  const facetedColumns: FacetedColumn<PriceRow>[] = [
    ...effectiveColumns.map((c) => ({
      key: c.key,
      header: c.header,
      variant: variantOf(c.key),
      render: (r: PriceRow) => c.render?.(r, 0) ?? '',
    })),
    {
      key: 'actions',
      header: '',
      variant: 'num' as const,
      render: (r: PriceRow) => (
        <button
          type="button"
          className="link-btn danger"
          onClick={() => deleteMut.mutate(r.id)}
          data-testid="sp-delete"
        >
          Borrar
        </button>
      ),
    },
  ];

  // Filtro del carril por producto/SKU (búsqueda).
  const tq = tarifaSearch.trim().toLowerCase();
  const shownPrices = tq
    ? prices.filter(
        (p) => p.productName.toLowerCase().includes(tq) || (p.sku ?? '').toLowerCase().includes(tq),
      )
    : prices;

  // Grupos por proveedor (productos ordenados alfabéticamente dentro de cada uno).
  const priceGroups = (() => {
    const bySupplier = new Map<string, { name: string; rows: PriceRow[] }>();
    for (const p of shownPrices) {
      const entry = bySupplier.get(p.supplierId) ?? { name: p.supplierName, rows: [] };
      entry.rows.push(p);
      bySupplier.set(p.supplierId, entry);
    }
    return [...bySupplier.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, e]) => ({
        key: id,
        label: e.name,
        meta: `${e.rows.length} ${e.rows.length === 1 ? 'tarifa' : 'tarifas'}`,
        rows: [...e.rows].sort((a, b) => a.productName.localeCompare(b.productName)),
      }));
  })();

  // Tabla agrupada de tarifas (común a la pestaña y a la ficha de proveedor).
  const priceTable = (
    <FacetedTable<PriceRow>
      layout="table"
      columns={facetedColumns}
      groups={priceGroups}
      rowKey={(r) => r.id}
      loading={pricesLoading}
      collapsedKeys={collapsed}
      onToggleGroup={toggleGroup}
      rowTestId="sp-row"
      emptyState={<span data-testid="sp-empty">Sin tarifas. Añade una o impórtalas por CSV.</span>}
    />
  );

  // Carril de la pestaña: Proveedor (selección única) + búsqueda por producto.
  const tarifaSections: FacetSection[] = [
    {
      kind: 'views',
      title: 'Proveedor',
      options: [
        { value: '', label: 'Todos los proveedores' },
        ...suppliers.map((s) => ({ value: s.id, label: s.name })),
      ].map((o) => ({ key: o.value, label: o.label })),
      active: supplierId,
      onSelect: setSupplierId,
      testIdPrefix: 'sp-view-supplier',
    },
  ];

  // ── Comparativa gráfica ──
  // S-25 (DR-06/P154): la comparativa de precios entre proveedores SIEMPRE se
  // dibuja en barras, IGNORANDO la preferencia global `dashboard.layout.chartKind`.
  // Es una excepción INTENCIONAL al toggle único barras↔línea del dashboard: la
  // comparación de precios se lee mejor en barras. No "arreglar" esto leyendo la
  // pref del dashboard — el comportamiento es deliberado.
  const chartKind = 'bars' as const;
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

  usePageActions(
    view === 'tarifas' ? (
      <>
        <button
          type="button"
          className="float-action-btn"
          disabled={!supplierId}
          onClick={() => setImporting(true)}
          aria-label={supplierId ? 'Importar CSV' : 'Elige un proveedor para importar su tarifa'}
          title={supplierId ? 'Importar CSV' : 'Elige un proveedor para importar su tarifa'}
          data-testid="sp-import"
        >
          <Upload size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`float-action-btn${columnsEditorOpen ? ' is-active' : ''}`}
          onClick={toggleColumnsEditor}
          aria-label="Ajustar columnas"
          title="Columnas"
          aria-expanded={columnsEditorOpen}
          data-testid="sp-columns-toggle"
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
      </>
    ) : null,
  );

  // Sub-navegación de vistas de tarifas (Tarifas por proveedor / Comparativa). Las pestañas de
  // PÁGINA (Proveedores/Tarifas/Pedidos/Propuesta) ya no viven aquí: se inyectan en la TopBar
  // desde SuppliersPage. En la vista detalle de proveedor (fixedSupplierId) no hay sub-vistas.
  const subViewNav = (
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
  );
  // Cabecera de card en UNA sola línea: sub-navegación de vistas + herramientas (filtro/CTA).
  // En la vista detalle (fixedSupplierId) no hay sub-nav: solo la fila de herramientas (si las hay).
  const renderHeader = (tools: ReactNode) =>
    fixedSupplierId ? (
      tools ? (
        <div className="dt-header-row">{tools}</div>
      ) : null
    ) : (
      <div className="dt-header-row">
        {subViewNav}
        {tools}
      </div>
    );

  return (
    <section className="catalog">
      {view === 'tarifas' ? (
        fixedSupplierId ? (
          // Ficha de proveedor (embebido): tabla agrupada simple, sin carril.
          <>
            {columnsEditor}
            <div className="table-panel">
              <div className="dt-header-row">
                <div className="users-toolbar">
                  <div className="sales-filters" />
                  <div className="ui-dt-toolbar-actions">
                    <Button
                      type="button"
                      disabled={!supplierId}
                      onClick={() => setAdding(true)}
                      data-testid="sp-add"
                      icon={<Plus size={16} aria-hidden="true" />}
                    >
                      Añadir tarifa
                    </Button>
                  </div>
                </div>
              </div>
              <div className="cat-main cat-main--solo" data-testid="sp-table">
                {priceTable}
              </div>
            </div>
          </>
        ) : (
          // Pestaña: carril (Proveedor + búsqueda) + tabla agrupada full-height,
          // mismo aspecto que Existencias/Proveedores.
          <>
            {columnsEditor}
            <div className="faceted-page" style={{ height: shellHeight }}>
              <div className="sp-tab-bar">
                {subViewNav}
                <Button
                  type="button"
                  disabled={!supplierId}
                  onClick={() => setAdding(true)}
                  data-testid="sp-add"
                  icon={<Plus size={16} aria-hidden="true" />}
                >
                  Añadir tarifa
                </Button>
              </div>
              <div className="inv-card">
                <div className="cat-layout">
                  <FacetRail
                    ariaLabel="Filtros de tarifas"
                    testId="sp-facets"
                    search={{
                      value: tarifaSearch,
                      onChange: setTarifaSearch,
                      placeholder: 'Buscar producto…',
                      testId: 'sp-search',
                    }}
                    sections={tarifaSections}
                  />
                  <ScrollShadowCell className="cat-main" data-testid="sp-table">
                    {priceTable}
                  </ScrollShadowCell>
                </div>
              </div>
            </div>
          </>
        )
      ) : (
        <>
          <div className="table-panel">
            {renderHeader(
              <div className="users-toolbar">
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
              </div>,
            )}
          </div>
          {/* Comparativa gráfica: media/mediana por proveedor + producto concreto.
              Apilados para que cada gráfico respire; con ≤3 proveedores las barras
              caben de sobra y los dos paneles van en línea. S-25/DR-06: SIEMPRE en
              barras (kind="bars" fijo), al margen del toggle del dashboard. */}
          <div
            className={`sp-cmp-charts${cmpStats.length > 0 && cmpStats.length <= 3 ? ' is-inline' : ''}`}
          >
            <div className="sp-cmp-panel" data-testid="sp-cmp-avg">
              <h3>Media y mediana por proveedor</h3>
              {comparisonLoading ? (
                <p className="catalog-empty">Cargando…</p>
              ) : cmpStats.length === 0 ? (
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
              <span className="search-field sp-cmp-search-row">
                <Input
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
              {/* Con varias coincidencias, píldoras para elegir el producto exacto
                  (sustituyen al clic en fila de la tabla retirada). */}
              {cmpQuery && filteredComparison.length > 1 && (
                <div className="sp-cmp-suggestions" data-testid="sp-cmp-suggestions">
                  {filteredComparison.slice(0, 6).map((r) => (
                    <button
                      key={r.productId}
                      type="button"
                      className={`sp-cmp-suggestion${r.productId === activeRow?.productId ? ' is-active' : ''}`}
                      onClick={() => setCmpProductId(r.productId)}
                      data-testid="sp-cmp-suggestion"
                    >
                      {r.productName}
                    </button>
                  ))}
                </div>
              )}
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
                  Busca un producto o arquetipo para comparar sus precios entre proveedores.
                </p>
              )}
            </div>
          </div>
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
            <Input
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
            <Button
              type="submit"
              disabled={!addProduct || !addPrice || upsertMut.isPending}
              data-testid="sp-add-save"
            >
              Guardar
            </Button>
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
    </section>
  );
}
