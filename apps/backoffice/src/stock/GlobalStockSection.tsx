import { stockLevel } from '@simpletpv/auth';
import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';

import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { listFamilies } from '../lib/families.js';
import { getGlobalStock, listAlerts, listMovements, setMinStock } from '../lib/stock.js';
import { ALERT_LABEL, dt, LEVEL_LABEL, MOVEMENT_LABEL, ROTATION_LABEL } from './labels.js';

interface AdjustState {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  quantity: string;
  min: string;
}

export function GlobalStockSection({ initialStoreId }: { initialStoreId?: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [storeId, setStoreId] = useState(initialStoreId ?? '');
  const [rotation, setRotation] = useState('');
  const [adjusting, setAdjusting] = useState<AdjustState | null>(null);
  const [movementsFor, setMovementsFor] = useState<string | null>(null);
  const [qtyOverlay, setQtyOverlay] = useState<Record<string, number>>({});
  // Solo productos con alguna tienda en alerta (rotura o bajo mínimo).
  const [alertsOnly, setAlertsOnly] = useState(false);
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

  const minMutation = useMutation({
    mutationFn: setMinStock,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stock-alerts'] }),
  });

  const rows = rawRows.map((row) => {
    const stores = row.stores.map((st) => {
      const q = qtyOverlay[`${row.productId}:${st.storeId}`] ?? st.quantity;
      return { ...st, quantity: q, level: stockLevel(q, st.minStock) };
    });
    return { ...row, stores, total: stores.reduce((acc, s) => acc + s.quantity, 0) };
  });

  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));

  const filtered = rows.filter((row) => {
    if (search && !row.productName.toLowerCase().includes(search.toLowerCase())) return false;
    if (storeId && !row.stores.some((s) => s.storeId === storeId)) return false;
    if (rotation && row.rotation !== rotation) return false;
    if (alertsOnly) {
      const scope = storeId ? row.stores.filter((s) => s.storeId === storeId) : row.stores;
      if (!scope.some((s) => s.level !== 'green')) return false;
    }
    return true;
  });

  // Resumen de roturas para el panel centralizado (críticas = sin sustituto).
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
  const softAlerts = alerts.length - criticalAlerts;

  const saveAdjust = (): void => {
    if (!adjusting) return;
    setQtyOverlay((prev) => ({
      ...prev,
      [`${adjusting.productId}:${adjusting.storeId}`]: Number(adjusting.quantity),
    }));
    minMutation.mutate({
      productId: adjusting.productId,
      storeId: adjusting.storeId,
      minStock: Number(adjusting.min),
    });
    setAdjusting(null);
  };

  return (
    <>
      <div className="table-panel">
        <div className="stock-filters">
          <div className="stock-filter-group">
            <span className="stock-filter-label">Producto</span>
            <span className="search-field">
              <input
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
              ariaLabel="Filtrar por arquetipo"
              data-testid="stock-family"
              options={[
                { value: '', label: 'Todos los arquetipos' },
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
          </div>
          <div className="stock-filter-group">
            <span className="stock-filter-label">Tienda</span>
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
          <div className="stock-filter-group">
            <span className="stock-filter-label">Roturas</span>
            <button
              type="button"
              className={`stock-alert-toggle${alertsOnly ? ' is-on' : ''}`}
              onClick={() => setAlertsOnly((v) => !v)}
              aria-pressed={alertsOnly}
              data-testid="stock-alerts-only"
            >
              Solo en alerta
            </button>
          </div>
        </div>

        {/* Panel centralizado de roturas: única vista de consulta de roturas de
            stock (reusa GET /stock/alerts), filtrado por la tienda activa. */}
        {alerts.length > 0 && (
          <div className="stock-alerts-panel" data-testid="stock-alerts-panel">
            <div className="stock-alerts-head">
              <strong>
                {alerts.length} {alerts.length === 1 ? 'rotura' : 'roturas'} de stock
              </strong>
              <span className="muted">
                {criticalAlerts} crítica{criticalAlerts === 1 ? '' : 's'} · {softAlerts} con
                sustituto
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

        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="stock-empty">
            Sin productos para los filtros seleccionados.
          </p>
        ) : (
          <table className="catalog-table" data-testid="stock-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Arquetipo</th>
                <th>Rotación</th>
                <th>{storeId ? storeOptions.find((s) => s.id === storeId)?.name : 'Por tienda'}</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const visibleStores = storeId
                  ? row.stores.filter((s) => s.storeId === storeId)
                  : row.stores;
                const rot = row.rotation;
                const singleStore = Boolean(storeId);
                const isExpanded = expanded.has(row.productId);
                const alertN = visibleStores.filter((s) => s.level !== 'green').length;
                // Abre el ajuste de existencias para una tienda concreta del producto.
                const openAdjust = (st: (typeof visibleStores)[number]): void =>
                  setAdjusting({
                    productId: row.productId,
                    productName: row.productName,
                    storeId: st.storeId,
                    storeName: st.storeName,
                    quantity: String(st.quantity),
                    min: String(st.minStock),
                  });
                return (
                  <Fragment key={row.productId}>
                    <tr data-testid="stock-row">
                      <td>{row.productName}</td>
                      <td className="muted">—</td>
                      <td>
                        <span
                          className={`rotation-meter rotation-${rot}`}
                          title={`Rotación ${ROTATION_LABEL[rot].toLowerCase()}`}
                        >
                          <span className="rotation-bars" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="rotation-label">{ROTATION_LABEL[rot]}</span>
                        </span>
                      </td>
                      <td>
                        {singleStore ? (
                          // Filtrado a una tienda: punto de nivel + clic para ajustar.
                          visibleStores.map((st) => (
                            <button
                              type="button"
                              key={st.storeId}
                              className="stock-store-inline"
                              onClick={() => openAdjust(st)}
                              data-testid="stock-store-cell"
                              title={`${LEVEL_LABEL[st.level]} · mín ${st.minStock} · clic para ajustar`}
                            >
                              <span
                                className={`stock-store-dot sb-${st.level}`}
                                aria-hidden="true"
                              />
                              <span className="stock-store-item-qty">{st.quantity}</span>
                            </button>
                          ))
                        ) : (
                          // Vista global: heatmap compacto plegable. La fila no crece
                          // con N tiendas; el desglose se abre bajo demanda.
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
                              {visibleStores.length}{' '}
                              {visibleStores.length === 1 ? 'tienda' : 'tiendas'}
                              {alertN > 0 && (
                                <span className="stock-heat-alert"> · {alertN} en alerta</span>
                              )}
                            </span>
                            <span className="stock-heat-caret" aria-hidden="true">
                              {isExpanded ? '▾' : '▸'}
                            </span>
                          </button>
                        )}
                      </td>
                      <td>
                        <strong>
                          {singleStore ? (visibleStores[0]?.quantity ?? 0) : row.total}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setMovementsFor(row.productId)}
                          data-testid="stock-history"
                        >
                          Movimientos
                        </button>
                      </td>
                    </tr>
                    {!singleStore && isExpanded && (
                      <tr className="stock-detail-row" data-testid="stock-detail-row">
                        <td colSpan={6}>
                          <div className="stock-store-list">
                            {visibleStores.map((st) => (
                              <button
                                type="button"
                                key={st.storeId}
                                className="stock-store-item"
                                onClick={() => openAdjust(st)}
                                data-testid="stock-store-cell"
                                title={`${LEVEL_LABEL[st.level]} · mín ${st.minStock} · clic para ajustar`}
                              >
                                <span
                                  className={`stock-store-dot sb-${st.level}`}
                                  aria-hidden="true"
                                />
                                <span className="stock-store-item-name">{st.storeName}</span>
                                <span className="stock-store-item-qty">{st.quantity}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
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
              <input
                type="number"
                min={0}
                value={adjusting.quantity}
                onChange={(e) => setAdjusting({ ...adjusting, quantity: e.target.value })}
                data-testid="stock-adjust-qty"
              />
            </label>
            <label>
              Stock mínimo
              <input
                type="number"
                min={0}
                value={adjusting.min}
                onChange={(e) => setAdjusting({ ...adjusting, min: e.target.value })}
                data-testid="stock-adjust-min"
              />
            </label>
          </div>
          <div className="modal-foot">
            <button type="button" onClick={() => setAdjusting(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveAdjust}
              data-testid="stock-adjust-save"
            >
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {movementsFor && (
        <MovementsModal productId={movementsFor} onClose={() => setMovementsFor(null)} />
      )}
    </>
  );
}

function MovementsModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', productId],
    queryFn: () => listMovements(productId),
  });

  return (
    <Modal onClose={onClose} testId="movements-modal" ariaLabel="Movimientos de stock">
      <h3>Movimientos de stock</h3>
      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="catalog-empty" data-testid="movements-empty">
          Sin movimientos.
        </p>
      ) : (
        <table className="catalog-table" data-testid="movements-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.id} data-testid="movement-row">
                <td className="muted">{dt.format(new Date(m.createdAt))}</td>
                <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                <td>{m.quantity}</td>
                <td className="muted">{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
