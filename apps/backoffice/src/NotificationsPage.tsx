import { DataTable } from '@simpletpv/ui';
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
          <DataTable
            data-testid="alerts-table"
            rowTestId="alert-row"
            rows={alerts}
            rowKey={(a) => a.id}
            loading={loadingAlerts}
            emptyState={
              <span className="catalog-empty" data-testid="alerts-empty">
                No hay alertas de stock.
              </span>
            }
            columns={[
              { key: 'product', header: 'Producto', render: (a) => a.productName },
              { key: 'store', header: 'Tienda', render: (a) => a.storeName },
              {
                key: 'alert',
                header: 'Alerta',
                // Degradación por arquetipo: una rotura con sustituto en la familia se pinta
                // como aviso (amarillo), no como crítica (rojo).
                render: (a) => (
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
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (a) => (
                  <button
                    type="button"
                    className="config-trigger"
                    onClick={() => onResolve?.resolveStock(a.storeId, a.productName)}
                    data-testid="alert-resolve"
                  >
                    Resolver
                  </button>
                ),
              },
            ]}
          />
        </div>
      </div>

      <div className="notif-section">
        <div className="notif-section-head">
          <h2 className="notif-section-title">Caducidad de lotes</h2>
          {expiring.length > 0 && <span className="notif-section-count">{expiring.length}</span>}
        </div>
        <div className="table-panel">
          <DataTable
            data-testid="expiring-table"
            rowTestId="expiring-row"
            rows={expiring}
            rowKey={(b) => b.id}
            loading={loadingExpiring}
            emptyState={
              <span className="catalog-empty" data-testid="expiring-empty">
                No hay lotes caducados ni próximos a caducar.
              </span>
            }
            columns={[
              { key: 'product', header: 'Producto', render: (b) => b.productName },
              { key: 'store', header: 'Tienda', render: (b) => b.storeName },
              { key: 'lot', header: 'Lote', hideOnNarrow: true, render: (b) => b.lotCode },
              {
                key: 'expiry',
                header: 'Caducidad',
                hideOnNarrow: true,
                render: (b) => df.format(new Date(b.expiryDate)),
              },
              { key: 'qty', header: 'Cantidad', render: (b) => b.quantity },
              {
                key: 'status',
                header: 'Estado',
                render: (b) => (
                  <span className="notif-status">
                    <span className={`expiry-tag expiry-${b.status}`}>
                      {EXPIRY_LABEL[b.status] ?? b.status}
                    </span>
                    <span className="expiry-when">{expiryDaysText(b.daysToExpiry)}</span>
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (b) => (
                  <button
                    type="button"
                    className="config-trigger"
                    onClick={() => onResolve?.resolveStock(b.storeId, b.productName)}
                    data-testid="expiring-resolve"
                  >
                    Ver en stock
                  </button>
                ),
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
