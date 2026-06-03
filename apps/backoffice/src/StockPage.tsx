import { type StockLevel, stockLevel } from '@simpletpv/auth';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  DEMO_FAMILIES,
  DEMO_PRODUCT_ROTATION,
  DEMO_STOCK_IN_TRANSIT,
  productRootFamily,
  type Rotation,
} from './demo/demoData.js';
import { listStores } from './lib/admin.js';
import { api } from './lib/auth.js';
import {
  createTransfer,
  getGlobalStock,
  listAlerts,
  listMovements,
  listTransfers,
  sendTransfer,
  setMinStock,
} from './lib/stock.js';

const ROTATION_LABEL: Record<Rotation, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const LEVEL_LABEL: Record<StockLevel, string> = { red: 'Sin stock', yellow: 'Bajo', green: 'OK' };
const ALERT_LABEL: Record<string, string> = { OUT_OF_STOCK: 'Sin stock', LOW_STOCK: 'Stock bajo' };
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  RECEIVED: 'Recibido',
  CLOSED: 'Cerrado',
};
const MOVEMENT_LABEL: Record<string, string> = {
  SALE: 'Venta',
  RETURN: 'Devolución',
  TRANSFER_IN: 'Entrada traspaso',
  TRANSFER_OUT: 'Salida traspaso',
  PURCHASE_RECEIPT: 'Recepción compra',
  ADJUSTMENT: 'Ajuste',
};
const dt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// Punto de color del semáforo (rojo/amarillo/verde) según el nivel de stock.
function LevelDot({ level }: { level: StockLevel }) {
  return (
    <span
      className={`stock-dot stock-${level}`}
      data-testid={`stock-level-${level}`}
      title={LEVEL_LABEL[level]}
    />
  );
}

type Section = 'global' | 'alerts' | 'transfers';

export function StockPage() {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>('global');

  // Contador del subtab "Alertas" (badge). Comparte queryKey con AlertsSection.
  const { data: alertCount = [] } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });

  // Tiempo real (#33): el SSE invalida las queries de stock/alertas al recibir
  // los eventos, así el panel se actualiza sin recargar.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'stock.changed') {
        void qc.invalidateQueries({ queryKey: ['stock-global'] });
        void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      } else if (event.type === 'alert.created') {
        void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  return (
    <section className="catalog" data-testid="stock-page">
      <header className="catalog-head">
        <div>
          <h2>Stock</h2>
          <p className="catalog-sub">Stock por tienda en tiempo real</p>
        </div>
      </header>
      <nav className="bo-tabs" data-testid="stock-subtabs">
        <button
          className={`bo-tab ${section === 'global' ? 'active' : ''}`}
          onClick={() => setSection('global')}
          data-testid="stock-tab-global"
        >
          Stock global
        </button>
        <button
          className={`bo-tab ${section === 'alerts' ? 'active' : ''}`}
          onClick={() => setSection('alerts')}
          data-testid="stock-tab-alerts"
        >
          Alertas
          {alertCount.length > 0 && <span className="subtab-badge">{alertCount.length}</span>}
        </button>
        <button
          className={`bo-tab ${section === 'transfers' ? 'active' : ''}`}
          onClick={() => setSection('transfers')}
          data-testid="stock-tab-transfers"
        >
          Traspasos
        </button>
      </nav>

      {section === 'global' && <GlobalStockSection />}
      {section === 'alerts' && <AlertsSection />}
      {section === 'transfers' && <TransfersSection />}
    </section>
  );
}

interface AdjustState {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  quantity: string;
  min: string;
}

function GlobalStockSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [rotation, setRotation] = useState('');
  const [adjusting, setAdjusting] = useState<AdjustState | null>(null);
  const [movementsFor, setMovementsFor] = useState<string | null>(null);
  // Overlay local de existencias ajustadas (demo: sin backend que persista).
  const [qtyOverlay, setQtyOverlay] = useState<Record<string, number>>({});

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });

  const minMutation = useMutation({
    mutationFn: setMinStock,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stock-alerts'] }),
  });

  // Aplica los ajustes locales y recalcula nivel/total.
  const rows = rawRows.map((row) => {
    const stores = row.stores.map((st) => {
      const q = qtyOverlay[`${row.productId}:${st.storeId}`] ?? st.quantity;
      return { ...st, quantity: q, level: stockLevel(q, st.minStock) };
    });
    return { ...row, stores, total: stores.reduce((acc, s) => acc + s.quantity, 0) };
  });

  const storeOptions = rows[0]?.stores.map((s) => ({ id: s.storeId, name: s.storeName })) ?? [];

  const filtered = rows.filter((row) => {
    if (search && !row.productName.toLowerCase().includes(search.toLowerCase())) return false;
    if (familyId && productRootFamily(row.productId)?.id !== familyId) return false;
    if (rotation && (DEMO_PRODUCT_ROTATION[row.productId] ?? 'media') !== rotation) return false;
    if (storeId && !row.stores.some((s) => s.storeId === storeId)) return false;
    return true;
  });

  // KPIs del conjunto filtrado (respetan el filtro de tienda).
  const cells = filtered.flatMap((r) => r.stores.filter((s) => !storeId || s.storeId === storeId));
  const kpis = {
    units: cells.reduce((acc, s) => acc + s.quantity, 0),
    out: cells.filter((s) => s.level === 'red').length,
    low: cells.filter((s) => s.level === 'yellow').length,
    inTransit: DEMO_STOCK_IN_TRANSIT,
  };

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

  if (isLoading) {
    return <p className="catalog-empty">Cargando…</p>;
  }

  return (
    <>
      <div className="stock-kpis" data-testid="stock-kpis">
        <div className="stock-kpi">
          <span className="stock-kpi-val">{kpis.units}</span>
          <span className="stock-kpi-label">Unidades</span>
        </div>
        <div className="stock-kpi">
          <span className="stock-kpi-val red">{kpis.out}</span>
          <span className="stock-kpi-label">Roturas</span>
        </div>
        <div className="stock-kpi">
          <span className="stock-kpi-val yellow">{kpis.low}</span>
          <span className="stock-kpi-label">Stock bajo</span>
        </div>
        <div className="stock-kpi">
          <span className="stock-kpi-val">{kpis.inTransit}</span>
          <span className="stock-kpi-label">En tránsito</span>
        </div>
      </div>

      <div className="sales-filters">
        <input
          className="catalog-search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="stock-search"
        />
        <select
          className="catalog-search"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
          data-testid="stock-family"
        >
          <option value="">Todas las familias</option>
          {DEMO_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          className="catalog-search"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          data-testid="stock-store"
        >
          <option value="">Todas las tiendas</option>
          {storeOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="catalog-search"
          value={rotation}
          onChange={(e) => setRotation(e.target.value)}
          data-testid="stock-rotation"
        >
          <option value="">Toda rotación</option>
          <option value="alta">Rotación alta</option>
          <option value="media">Rotación media</option>
          <option value="baja">Rotación baja</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="catalog-empty" data-testid="stock-empty">
          Sin productos para los filtros seleccionados.
        </p>
      ) : (
        <table className="catalog-table" data-testid="stock-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Familia</th>
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
              const rot = DEMO_PRODUCT_ROTATION[row.productId] ?? 'media';
              return (
                <tr key={row.productId} data-testid="stock-row">
                  <td>{row.productName}</td>
                  <td className="muted">{productRootFamily(row.productId)?.name ?? '—'}</td>
                  <td>
                    <span className={`rotation-tag rotation-${rot}`}>{ROTATION_LABEL[rot]}</span>
                  </td>
                  <td>
                    <span className="stock-badges">
                      {visibleStores.map((st) => (
                        <button
                          type="button"
                          key={st.storeId}
                          className={`store-stock-badge stock-${st.level}`}
                          onClick={() =>
                            setAdjusting({
                              productId: row.productId,
                              productName: row.productName,
                              storeId: st.storeId,
                              storeName: st.storeName,
                              quantity: String(st.quantity),
                              min: String(st.minStock),
                            })
                          }
                          data-testid="stock-store-cell"
                          title={`${LEVEL_LABEL[st.level]} · mín ${st.minStock} · clic para ajustar`}
                        >
                          <span className={`stock-dot stock-${st.level}`} />
                          {st.storeName} : {st.quantity}
                        </button>
                      ))}
                    </span>
                  </td>
                  <td>
                    <strong>{storeId ? (visibleStores[0]?.quantity ?? 0) : row.total}</strong>
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
              );
            })}
          </tbody>
        </table>
      )}

      {adjusting && (
        <div className="modal-backdrop" onClick={() => setAdjusting(null)}>
          <div
            className="modal modal--form"
            onClick={(e) => e.stopPropagation()}
            data-testid="stock-adjust-form"
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
          </div>
        </div>
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="movements-modal">
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
      </div>
    </div>
  );
}

function AlertsSection() {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });

  if (isLoading) {
    return <p className="catalog-empty">Cargando…</p>;
  }
  if (alerts.length === 0) {
    return (
      <p className="catalog-empty" data-testid="alerts-empty">
        No hay alertas activas.
      </p>
    );
  }

  return (
    <table className="catalog-table" data-testid="alerts-table">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Tienda</th>
          <th>Alerta</th>
        </tr>
      </thead>
      <tbody>
        {alerts.map((a) => (
          <tr key={a.id} data-testid="alert-row">
            <td>{a.productName}</td>
            <td>{a.storeName}</td>
            <td>
              <span
                className={`stock-tag stock-${a.alertType === 'OUT_OF_STOCK' ? 'red' : 'yellow'}`}
              >
                {ALERT_LABEL[a.alertType] ?? a.alertType}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TransfersSection() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => listTransfers(),
    placeholderData: keepPreviousData,
  });

  const sendMutation = useMutation({
    mutationFn: sendTransfer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] });
      void qc.invalidateQueries({ queryKey: ['stock-global'] });
    },
  });

  return (
    <>
      <header className="catalog-head">
        <h2>Traspasos</h2>
        <div className="catalog-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
            data-testid="new-transfer"
          >
            Nuevo traspaso
          </button>
        </div>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : transfers.length === 0 ? (
        <p className="catalog-empty" data-testid="transfers-empty">
          Sin traspasos.
        </p>
      ) : (
        <table className="catalog-table" data-testid="transfers-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Líneas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} data-testid="transfer-row">
                <td className="muted">{dt.format(new Date(t.createdAt))}</td>
                <td>{t.lines.length}</td>
                <td>
                  <span className="stock-tag" data-testid="transfer-status">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td>
                  {t.status === 'DRAFT' && (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={sendMutation.isPending}
                      onClick={() => sendMutation.mutate(t.id)}
                      data-testid="transfer-send"
                    >
                      Enviar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateTransferModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['transfers'] });
          }}
        />
      )}
    </>
  );
}

function CreateTransferModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: globalRows = [] } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });

  const [originStoreId, setOriginStoreId] = useState('');
  const [destStoreId, setDestStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');

  const mutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: onCreated,
  });

  const canSubmit =
    originStoreId && destStoreId && originStoreId !== destStoreId && productId && Number(qty) > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="transfer-form">
        <h3>Nuevo traspaso</h3>
        <div className="modal-row">
          <label>Origen</label>
          <select
            value={originStoreId}
            onChange={(e) => setOriginStoreId(e.target.value)}
            data-testid="transfer-origin"
          >
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Destino</label>
          <select
            value={destStoreId}
            onChange={(e) => setDestStoreId(e.target.value)}
            data-testid="transfer-dest"
          >
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Producto</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            data-testid="transfer-product"
          >
            <option value="">—</option>
            {globalRows.map((r) => (
              <option key={r.productId} value={r.productId}>
                {r.productName}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Cantidad</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            data-testid="transfer-qty"
          />
        </div>
        {originStoreId && destStoreId && originStoreId === destStoreId && (
          <p className="muted">Origen y destino deben ser distintos.</p>
        )}
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                originStoreId,
                destStoreId,
                lines: [{ productId, quantitySent: Number(qty) }],
              })
            }
            data-testid="transfer-save"
          >
            Crear
          </button>
        </div>
        {mutation.isError && <p className="muted">No se pudo crear el traspaso.</p>}
      </div>
    </div>
  );
}
