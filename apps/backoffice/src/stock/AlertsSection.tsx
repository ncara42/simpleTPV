import { useQuery } from '@tanstack/react-query';

import { listAlerts } from '../lib/stock.js';
import { ALERT_LABEL } from './labels.js';

export function AlertsSection() {
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
