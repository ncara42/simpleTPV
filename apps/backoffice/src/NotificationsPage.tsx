import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './lib/auth.js';
import { usePageHeader } from './lib/pageHeader.js';
import { listAlerts } from './lib/stock.js';
import { ALERT_LABEL } from './stock/labels.js';

// Portal de notificaciones: centraliza las alertas de stock (antes vivían en un
// subtab de Stock). El badge de la campana (TopBar) y el del sidebar comparten
// la queryKey ['stock-alerts'] con esta vista.
export function NotificationsPage() {
  const qc = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });

  // Tiempo real (#33): el SSE refresca la lista al crearse nuevas alertas.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'alert.created') {
        void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  usePageHeader('Notificaciones', 'Alertas de stock en tiempo real');

  return (
    <section className="catalog" data-testid="notifications-page">
      <div className="table-panel">
        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : alerts.length === 0 ? (
          <p className="catalog-empty" data-testid="alerts-empty">
            No hay notificaciones.
          </p>
        ) : (
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
                    {/* Degradación por arquetipo: una rotura con sustituto en la
                        familia se pinta como aviso (amarillo), no como crítica (rojo). */}
                    <span
                      className={`stock-tag stock-${a.severity === 'critical' ? 'red' : 'yellow'}`}
                    >
                      {ALERT_LABEL[a.alertType] ?? a.alertType}
                    </span>
                    {a.hasSubstituteStock && (
                      <span className="alert-substitute" data-testid="alert-substitute">
                        · hay sustituto
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
