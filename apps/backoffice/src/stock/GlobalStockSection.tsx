import { stockLevel } from '@simpletpv/auth';
import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { DEMO_FAMILIES, DEMO_PRODUCT_ROTATION, productRootFamily } from '../demo/demoData.js';
import { getGlobalStock, listMovements, setMinStock } from '../lib/stock.js';
import { dt, LEVEL_LABEL, MOVEMENT_LABEL, ROTATION_LABEL } from './labels.js';

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
  // Filtro de tienda; puede venir preseleccionado al llegar desde un acceso
  // directo de la página de Tiendas.
  const [storeId, setStoreId] = useState(initialStoreId ?? '');
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
        {/* Filtros separados por aquello que acotan: el PRODUCTO (qué se busca) y
            la TIENDA (dónde se mira). Antes estaban mezclados en una sola barra. */}
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
                ...DEMO_FAMILIES.map((f) => ({ value: f.id, label: f.name })),
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
        </div>

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
                const rot = DEMO_PRODUCT_ROTATION[row.productId] ?? 'media';
                return (
                  <tr key={row.productId} data-testid="stock-row">
                    <td>{row.productName}</td>
                    <td className="muted">{productRootFamily(row.productId)?.name ?? '—'}</td>
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
                      {/* Lista compacta por tienda: punto de nivel + nombre + cantidad.
                          Escala a muchas tiendas (apilado vertical) mejor que las
                          píldoras anteriores. Cada fila abre el ajuste. */}
                      <div className="stock-store-list">
                        {visibleStores.map((st) => (
                          <button
                            type="button"
                            key={st.storeId}
                            className="stock-store-item"
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
                            <span className={`stock-store-dot sb-${st.level}`} aria-hidden="true" />
                            <span className="stock-store-item-name">{st.storeName}</span>
                            <span className="stock-store-item-qty">{st.quantity}</span>
                          </button>
                        ))}
                      </div>
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
