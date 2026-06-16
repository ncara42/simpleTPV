import { type StockGlobalRow, stockLevel } from '@simpletpv/auth';
import {
  Button,
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  Input,
  Select,
} from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { useTableColumns } from '../components/useTableColumns.js';
import { listStores } from '../lib/admin.js';
import { listFamilies } from '../lib/families.js';
import { formErrorMessage } from '../lib/form-error.js';
import { adjustStock, getGlobalStock, listAlerts, setMinStock } from '../lib/stock.js';
import { ALERT_LABEL, LEVEL_LABEL, ROTATION_LABEL } from './labels.js';

interface AdjustState {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  quantity: string;
  min: string;
  // Motivo del ajuste (obligatorio en POST /stock/adjust; auditoría).
  reason: string;
}

export function GlobalStockSection({
  initialStoreId,
  initialSearch,
}: {
  initialStoreId?: string | null;
  initialSearch?: string | null;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState(initialSearch ?? '');
  const [familyId, setFamilyId] = useState('');
  const [storeId, setStoreId] = useState(initialStoreId ?? '');
  const [rotation, setRotation] = useState('');
  const [adjusting, setAdjusting] = useState<AdjustState | null>(null);
  const [sort, setSort] = useState<DataTableSort | undefined>(undefined);
  // Desglose por tienda plegado por defecto: la fila no crece con N tiendas. Se
  // expande bajo demanda mostrando la mini-tabla por tienda.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (productId: string): void =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });

  // Roturas centralizadas: GET /stock/alerts (filtrado por la tienda activa). Es el
  // panel único de consulta de roturas (antes dispersas en Notificaciones/Dashboard).
  const { data: alerts = [] } = useQuery({
    queryKey: ['stock-alerts', storeId || null],
    queryFn: () => listAlerts(storeId || undefined),
  });

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  // Las opciones del filtro de tienda salen de TODAS las tiendas (no solo de las que
  // tienen stock del primer producto): así el filtro preseleccionado al llegar desde
  // "Ver stock" de Tiendas se muestra siempre, en vez de quedar en "Seleccionar…".
  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });

  // Ajuste REAL (E-01): la cantidad va a POST /stock/adjust (movimiento
  // ADJUSTMENT auditable) y el mínimo a PUT /stock/min; al terminar, refetch.
  const adjustMutation = useMutation({
    mutationFn: async (a: AdjustState) => {
      await adjustStock({
        productId: a.productId,
        storeId: a.storeId,
        newQuantity: Number(a.quantity),
        reason: a.reason.trim() || 'Ajuste manual desde backoffice',
      });
      await setMinStock({ productId: a.productId, storeId: a.storeId, minStock: Number(a.min) });
    },
    onSuccess: () => {
      setAdjusting(null);
      void qc.invalidateQueries({ queryKey: ['stock-global'] });
      void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });

  const rows = rawRows.map((row) => ({
    ...row,
    stores: row.stores.map((st) => ({ ...st, level: stockLevel(st.quantity, st.minStock) })),
  }));

  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));

  const filtered = rows.filter((row) => {
    if (search && !row.productName.toLowerCase().includes(search.toLowerCase())) return false;
    if (storeId && !row.stores.some((s) => s.storeId === storeId)) return false;
    if (rotation && row.rotation !== rotation) return false;
    return true;
  });

  // Resumen de roturas para el panel centralizado (críticas = sin sustituto).
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
  const softAlerts = alerts.length - criticalAlerts;

  // Fila enriquecida para el DataTable: tiendas visibles según el filtro.
  type StockRow = (typeof rows)[number];
  const singleStore = Boolean(storeId);
  const visibleStoresOf = (row: StockRow) =>
    storeId ? row.stores.filter((s) => s.storeId === storeId) : row.stores;
  const openAdjust = (row: StockRow, st: StockGlobalRow['stores'][number]): void =>
    setAdjusting({
      productId: row.productId,
      productName: row.productName,
      storeId: st.storeId,
      storeName: st.storeName,
      quantity: String(st.quantity),
      min: String(st.minStock),
      reason: '',
    });

  const saveAdjust = (): void => {
    if (!adjusting || adjustMutation.isPending) return;
    adjustMutation.mutate(adjusting);
  };

  // Columnas del DataTable. D-12: Producto · Por tienda · Total · Rotación (la
  // columna Familia anterior siempre pintaba "—": eliminada). La acción
  // Movimientos va fija fuera de la configuración (I-12 la reubicará).
  const dataColumns: DataTableColumn<StockRow>[] = [
    { key: 'product', header: 'Producto', sortable: true, render: (r) => r.productName },
    {
      key: 'rotation',
      header: 'Rotación',
      render: (r) => (
        <span
          className={`rotation-meter rotation-${r.rotation}`}
          title={`Rotación ${ROTATION_LABEL[r.rotation].toLowerCase()}`}
        >
          <span className="rotation-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="rotation-label">{ROTATION_LABEL[r.rotation]}</span>
        </span>
      ),
    },
    {
      key: 'stores',
      header: singleStore
        ? (storeOptions.find((s) => s.id === storeId)?.name ?? 'Tienda')
        : 'Por tienda',
      render: (row) => {
        const visibleStores = visibleStoresOf(row);
        if (singleStore) {
          return visibleStores.map((st) => (
            <button
              type="button"
              key={st.storeId}
              className="stock-store-inline"
              onClick={() => openAdjust(row, st)}
              data-testid="stock-store-cell"
              title={`${LEVEL_LABEL[st.level]} · mín ${st.minStock} · clic para ajustar`}
            >
              <span className={`stock-store-dot sb-${st.level}`} aria-hidden="true" />
              <span className="stock-store-item-qty">{st.quantity}</span>
            </button>
          ));
        }
        const isExpanded = expanded.has(row.productId);
        const alertN = visibleStores.filter((s) => s.level !== 'green').length;
        return (
          <button
            type="button"
            className="stock-heatmap"
            onClick={() => toggleExpanded(row.productId)}
            aria-expanded={isExpanded}
            data-testid="stock-heatmap"
          >
            <span className="stock-heat-dots" aria-hidden="true">
              {visibleStores.map((st) => (
                <span
                  key={st.storeId}
                  className={`stock-heat-dot sb-${st.level}`}
                  title={`${st.storeName}: ${st.quantity}`}
                />
              ))}
            </span>
            <span className="stock-heat-meta">
              {visibleStores.length} {visibleStores.length === 1 ? 'tienda' : 'tiendas'}
              {alertN > 0 && <span className="stock-heat-alert"> · {alertN} en alerta</span>}
            </span>
            <span className="stock-heat-caret" aria-hidden="true">
              {isExpanded ? '▾' : '▸'}
            </span>
          </button>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      render: (row) => (
        <strong>{singleStore ? (visibleStoresOf(row)[0]?.quantity ?? 0) : row.total}</strong>
      ),
    },
  ];
  const {
    effectiveColumns,
    editor: columnsEditor,
    editorOpen: columnsEditorOpen,
    toggleEditor: toggleColumnsEditor,
  } = useTableColumns('table.stock.columns', dataColumns, {
    editorTestId: 'stock-columns-editor',
    title: 'Columnas de stock',
  });
  const tableColumns = effectiveColumns;

  // Orden cliente por producto/total.
  const sortedRows = sort
    ? [...filtered].sort((a, b) => {
        const dir = sort.dir === 'desc' ? -1 : 1;
        if (sort.key === 'total') return (a.total - b.total) * dir;
        return a.productName.localeCompare(b.productName) * dir;
      })
    : filtered;

  return (
    <>
      {/* U-10: los avisos de roturas viven en su PROPIO panel, encima de la tabla
          (antes anidados dentro del table-panel de la tabla). Reusa GET /stock/alerts. */}
      {alerts.length > 0 && (
        <div className="table-panel stock-alerts-panel" data-testid="stock-alerts-panel">
          <div className="stock-alerts-head">
            <strong>
              {alerts.length} {alerts.length === 1 ? 'rotura' : 'roturas'} de stock
            </strong>
            <span className="muted">
              {criticalAlerts} crítica{criticalAlerts === 1 ? '' : 's'} · {softAlerts} con sustituto
            </span>
          </div>
          <ul className="stock-alerts-list">
            {alerts.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className={`stock-alert-item sev-${a.severity}`}
                data-testid="stock-alert-item"
              >
                <span className="stock-alert-name">{a.productName}</span>
                <span className="stock-alert-store muted">{a.storeName}</span>
                <span className="stock-alert-tag">{ALERT_LABEL[a.alertType]}</span>
              </li>
            ))}
          </ul>
          {alerts.length > 8 && (
            <p className="muted stock-alerts-more">y {alerts.length - 8} más…</p>
          )}
        </div>
      )}

      {columnsEditor}

      <div className="table-actions">
        <button
          type="button"
          className="ui-dt-cols-trigger"
          onClick={toggleColumnsEditor}
          data-testid="stock-columns-toggle"
          aria-expanded={columnsEditorOpen}
        >
          Columnas
        </button>
      </div>

      <div className="table-panel">
        <DataTable
          columns={tableColumns}
          rows={sortedRows}
          rowKey={(r) => r.productId}
          loading={isLoading}
          toolbar={
            <div className="users-toolbar">
              <div className="sales-filters">
                <span className="search-field">
                  <Input
                    className="catalog-search"
                    placeholder="Buscar producto…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="stock-search"
                  />
                </span>
                <Select
                  className="catalog-search"
                  value={familyId}
                  onChange={(value) => setFamilyId(value)}
                  ariaLabel="Filtrar por familia"
                  data-testid="stock-family"
                  options={[
                    { value: '', label: 'Todas las familias' },
                    ...families.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                />
                <Select
                  className="catalog-search"
                  value={rotation}
                  onChange={(value) => setRotation(value)}
                  ariaLabel="Filtrar por rotación"
                  data-testid="stock-rotation"
                  options={[
                    { value: '', label: 'Toda rotación' },
                    { value: 'alta', label: 'Rotación alta' },
                    { value: 'media', label: 'Rotación media' },
                    { value: 'baja', label: 'Rotación baja' },
                  ]}
                />
                <Select
                  className="catalog-search"
                  value={storeId}
                  onChange={(value) => setStoreId(value)}
                  ariaLabel="Filtrar por tienda"
                  data-testid="stock-store"
                  options={[
                    { value: '', label: 'Todas las tiendas' },
                    ...storeOptions.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>
            </div>
          }
          {...(sort ? { sort } : {})}
          onSortChange={(key) =>
            setSort((cur) =>
              cur?.key === key
                ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' },
            )
          }
          rowTestId="stock-row"
          renderDetail={(row) => {
            if (singleStore || !expanded.has(row.productId)) return null;
            return (
              <div className="stock-store-list" data-testid="stock-detail-row">
                {visibleStoresOf(row).map((st) => (
                  <button
                    type="button"
                    key={st.storeId}
                    className="stock-store-item"
                    onClick={() => openAdjust(row, st)}
                    data-testid="stock-store-cell"
                    title={`${LEVEL_LABEL[st.level]} · mín ${st.minStock} · clic para ajustar`}
                  >
                    <span className={`stock-store-dot sb-${st.level}`} aria-hidden="true" />
                    <span className="stock-store-item-name">{st.storeName}</span>
                    <span className="stock-store-item-qty">{st.quantity}</span>
                  </button>
                ))}
              </div>
            );
          }}
          emptyState={
            <span data-testid="stock-empty">Sin productos para los filtros seleccionados.</span>
          }
          data-testid="stock-table"
        />
      </div>

      {adjusting && (
        <Modal
          onClose={() => setAdjusting(null)}
          className="modal--form"
          testId="stock-adjust-form"
        >
          <h3>Ajustar existencias</h3>
          <p className="muted">
            {adjusting.productName} · {adjusting.storeName}
          </p>
          <div className="modal-row">
            <label>
              Existencias
              <Input
                type="number"
                min={0}
                value={adjusting.quantity}
                onChange={(e) => setAdjusting({ ...adjusting, quantity: e.target.value })}
                data-testid="stock-adjust-qty"
              />
            </label>
            <label>
              Stock mínimo
              <Input
                type="number"
                min={0}
                value={adjusting.min}
                onChange={(e) => setAdjusting({ ...adjusting, min: e.target.value })}
                data-testid="stock-adjust-min"
              />
            </label>
          </div>
          <label>
            Motivo
            <Input
              placeholder="Recuento, merma, rotura…"
              value={adjusting.reason}
              onChange={(e) => setAdjusting({ ...adjusting, reason: e.target.value })}
              data-testid="stock-adjust-reason"
            />
          </label>
          {adjustMutation.isError && (
            <p className="form-error">
              {formErrorMessage(adjustMutation.error, 'No se pudo guardar el ajuste.')}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" onClick={() => setAdjusting(null)}>
              Cancelar
            </button>
            <Button
              type="button"
              onClick={saveAdjust}
              disabled={adjustMutation.isPending}
              data-testid="stock-adjust-save"
            >
              {adjustMutation.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
