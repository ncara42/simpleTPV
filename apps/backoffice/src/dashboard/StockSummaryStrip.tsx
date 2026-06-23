import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock } from 'lucide-react';

import { listAlerts, listExpiringBatches } from '../lib/stock.js';

// Cuántas roturas se listan inline en la franja antes de "+N más".
const TOP_N = 5;

interface StockSummaryStripProps {
  // Navegación existente del shell (I-16/I-17): el enlace "Ver inventario →" llama
  // onNavigate('stock'), que el shell redirige a /inventario?vista=existencias.
  onNavigate?: ((tab: 'suppliers' | 'stock' | 'sales') => void) | undefined;
}

// S-13 — Franja compacta de resumen de inventario, SIEMPRE visible sobre el lienzo del
// Dashboard (hallazgo T2: el usuario busca las roturas en el dashboard, no en la campana).
//
// Es una RÉPLICA del panel de roturas de Inventario y de la campana (P075): no toca ni la
// queryKey ['stock-alerts'] de la campana ni la de Inventario. Usa su PROPIA queryKey
// ['dash-stock-summary'] (global, sin storeId — el dashboard ya no expone selector de tienda)
// para no acoplarse a esas caches y aceptar una llamada extra a /stock/alerts.
export function StockSummaryStrip({ onNavigate }: StockSummaryStripProps) {
  // Roturas activas (estado actual; sin periodo, P077). Key propia y namespaced.
  const alertsQuery = useQuery({
    queryKey: ['dash-stock-summary'],
    queryFn: () => listAlerts(),
  });
  // Caducidades como bloque pequeño (P076): número de lotes por caducar. Key propia.
  const expiringQuery = useQuery({
    queryKey: ['dash-expiry-summary'],
    queryFn: () => listExpiringBatches(),
  });

  const alerts = alertsQuery.data ?? [];
  const expiringCount = expiringQuery.data?.length ?? 0;

  // Desglose por severidad: 'critical' = sin sustituto (rotura crítica); 'soft' = hay
  // sustituto de la misma familia con stock (rotura degradada, el cliente sustituye).
  const criticas = alerts.filter((a) => a.severity === 'critical').length;
  const conSustituto = alerts.length - criticas;
  const top = alerts.slice(0, TOP_N);
  const restantes = alerts.length - top.length;

  const expiryBlock =
    expiringCount > 0 ? (
      <span className="dash-stock-summary-expiry" data-testid="dash-stock-summary-expiry">
        <Clock size={14} aria-hidden="true" />
        {expiringCount} {expiringCount === 1 ? 'lote por caducar' : 'lotes por caducar'}
      </span>
    ) : null;

  // Estado vacío POSITIVO verde (P079): sin roturas activas. La franja sigue visible y, si los
  // hay, mantiene el bloque de caducidad a la derecha.
  if (alerts.length === 0) {
    return (
      <aside
        className="dash-stock-summary dash-stock-summary--ok"
        data-testid="dash-stock-summary"
        aria-label="Resumen de inventario"
      >
        <span className="dash-stock-summary-ok" data-testid="stock-summary-ok">
          <Check size={15} aria-hidden="true" />
          Sin roturas de stock
        </span>
        {expiryBlock}
        <button
          type="button"
          className="link-btn dash-stock-summary-link"
          onClick={() => onNavigate?.('stock')}
          data-testid="dash-stock-summary-link"
        >
          Ver inventario →
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="dash-stock-summary"
      data-testid="dash-stock-summary"
      aria-label="Resumen de inventario"
    >
      <span className="dash-stock-summary-count">
        <AlertTriangle size={15} aria-hidden="true" />
        <strong>{alerts.length}</strong>{' '}
        {alerts.length === 1 ? 'producto en rotura' : 'productos en rotura'}
        <span className="dash-stock-summary-breakdown">
          {criticas} crítica{criticas === 1 ? '' : 's'} · {conSustituto} con sustituto
        </span>
      </span>
      <ul className="dash-stock-summary-list" data-testid="dash-stock-summary-list">
        {top.map((a) => (
          <li
            key={a.id}
            className={`dash-stock-summary-item lvl-${a.severity === 'critical' ? 'red' : 'yellow'}`}
          >
            <span className="dash-stock-summary-name">{a.productName}</span>
            <span className="dash-stock-summary-store">{a.storeName}</span>
          </li>
        ))}
        {restantes > 0 && <li className="dash-stock-summary-more">+{restantes} más</li>}
      </ul>
      {expiryBlock}
      <button
        type="button"
        className="link-btn dash-stock-summary-link"
        onClick={() => onNavigate?.('stock')}
        data-testid="dash-stock-summary-link"
      >
        Ver inventario →
      </button>
    </aside>
  );
}
