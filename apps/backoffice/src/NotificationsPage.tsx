import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './lib/auth.js';
import { usePageHeader } from './lib/pageHeader.js';
import { listAlerts, listExpiringBatches } from './lib/stock.js';
import { ALERT_LABEL, df, EXPIRY_LABEL, expiryDaysText } from './stock/labels.js';

// U-12: cada notificación lleva A LA ACCIÓN que la resuelve. El destino reutiliza
// la navegación del shell (Stock filtrado por tienda + búsqueda por producto), así
// se aterriza directamente sobre el producto afectado para reponer/ajustar o
// revisar sus lotes.
export interface NotifResolve {
  resolveStock: (storeId: string, productName: string) => void;
}

// Portal de notificaciones: centraliza las alertas de stock y la caducidad de
// lotes (#126 slice 4). El badge de la campana (TopBar) y el del sidebar comparten
// la queryKey ['stock-alerts'] con esta vista. La caducidad se computa on-read
// (sin cron): GET /stock/expiring devuelve lotes caducados o por caducar.
export function NotificationsPage({ onResolve }: { onResolve?: NotifResolve }) {
  const qc = useQueryClient();
  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });
  const { data: expiring = [], isLoading: loadingExpiring } = useQuery({
    queryKey: ['expiring-batches'],
    queryFn: () => listExpiringBatches(),
  });

  // Tiempo real (#33): el SSE refresca las alertas al crearse, y los lotes por
  // caducar cuando cambia el stock (una venta/recepción mueve cantidades de lote).
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'alert.created') {
        void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      }
      if (event.type === 'stock.changed') {
        void qc.invalidateQueries({ queryKey: ['expiring-batches'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  usePageHeader('Notificaciones', 'Alertas de stock y caducidad de lotes en tiempo real');

  return (
    <section className="catalog" data-testid="notifications-page">
      <div className="notif-section">
        <div className="notif-section-head">
          <h2 className="notif-section-title">Alertas de stock</h2>
          {alerts.length > 0 && <span className="notif-section-count">{alerts.length}</span>}
        </div>
        <div className="table-panel">
          {loadingAlerts ? (
            <p className="catalog-empty">Cargando…</p>
          ) : alerts.length === 0 ? (
            <p className="catalog-empty" data-testid="alerts-empty">
              No hay alertas de stock.
            </p>
          ) : (
            <table className="catalog-table" data-testid="alerts-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Tienda</th>
                  <th>Alerta</th>
                  <th aria-label="Acción" />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} data-testid="alert-row">
                    <td>{a.productName}</td>
                    <td>{a.storeName}</td>
                    <td>
                      {/* Degradación por arquetipo: una rotura con sustituto en la
                          familia se pinta como aviso (amarillo), no como crítica (rojo). */}
                      <span className="notif-status">
                        <span
                          className={`stock-tag stock-${a.severity === 'critical' ? 'red' : 'yellow'}`}
                        >
                          {ALERT_LABEL[a.alertType] ?? a.alertType}
                        </span>
                        {a.hasSubstituteStock && (
                          <span className="alert-substitute" data-testid="alert-substitute">
                            hay sustituto
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="notif-action-cell">
                      <button
                        type="button"
                        className="config-trigger"
                        onClick={() => onResolve?.resolveStock(a.storeId, a.productName)}
                        data-testid="alert-resolve"
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="notif-section">
        <div className="notif-section-head">
          <h2 className="notif-section-title">Caducidad de lotes</h2>
          {expiring.length > 0 && <span className="notif-section-count">{expiring.length}</span>}
        </div>
        <div className="table-panel">
          {loadingExpiring ? (
            <p className="catalog-empty">Cargando…</p>
          ) : expiring.length === 0 ? (
            <p className="catalog-empty" data-testid="expiring-empty">
              No hay lotes caducados ni próximos a caducar.
            </p>
          ) : (
            <table className="catalog-table" data-testid="expiring-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Tienda</th>
                  <th className="notif-hide-narrow">Lote</th>
                  <th className="notif-hide-narrow">Caducidad</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th aria-label="Acción" />
                </tr>
              </thead>
              <tbody>
                {expiring.map((b) => (
                  <tr key={b.id} data-testid="expiring-row">
                    <td>{b.productName}</td>
                    <td>{b.storeName}</td>
                    <td className="notif-hide-narrow">{b.lotCode}</td>
                    <td className="notif-hide-narrow">{df.format(new Date(b.expiryDate))}</td>
                    <td>{b.quantity}</td>
                    <td>
                      <span className="notif-status">
                        <span className={`expiry-tag expiry-${b.status}`}>
                          {EXPIRY_LABEL[b.status] ?? b.status}
                        </span>
                        <span className="expiry-when">{expiryDaysText(b.daysToExpiry)}</span>
                      </span>
                    </td>
                    <td className="notif-action-cell">
                      <button
                        type="button"
                        className="config-trigger"
                        onClick={() => onResolve?.resolveStock(b.storeId, b.productName)}
                        data-testid="expiring-resolve"
                      >
                        Ver en stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
