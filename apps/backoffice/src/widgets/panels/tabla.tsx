import './tabla.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getProductRankings, getSalesByEmployee, getSalesToday } from '../../lib/dashboard.js';
import { listAlerts } from '../../lib/stock.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// ── Formato es-ES ────────────────────────────────────────────────────────────
const nfEur0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  // es-ES no agrupa números de 4 cifras por defecto (6360 → «6360»); forzamos el separador
  // de miles para que las cifras de dinero salgan «6.360 €» como en el handoff.
  useGrouping: 'always',
});
const nfInt = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

// Máximo de filas por tarjeta (el handoff muestra 3 de ejemplo; con datos reales mostramos hasta 6).
const MAX_ROWS = 6;

// Iniciales (hasta 2) de un nombre para el avatar: «Dependiente Demo» → «DD».
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// ── 1 · Lista simple (facturación de hoy por tienda) ─────────────────────────────────────────────
export function SimpleList({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const rows = [...(q.data?.byStore ?? [])].sort((a, b) => b.today - a.today).slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-simple" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Ventas por tienda</div>
        {rows.map((r) => (
          <div className="tl-row" key={r.storeId}>
            <span>{r.storeName}</span>
            <span className="tl-value">{nfEur0.format(r.today)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── 2 · Con avatar (vendedores: iniciales + nº de tickets) ───────────────────────────────────────
export function AvatarList({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-emp', period, store],
    queryFn: () => getSalesByEmployee(period, store),
    placeholderData: keepPreviousData,
  });
  const rows = [...(q.data ?? [])].sort((a, b) => b.salesCount - a.salesCount).slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-avatar" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Vendedores</div>
        {rows.map((r, i) => (
          <div className="tl-row--plain" key={r.userId}>
            <span className={`tl-avatar${i === 0 ? ' tl-avatar--brand' : ''}`}>
              {initials(r.userName)}
            </span>
            <span className="tl-name">{r.userName}</span>
            <span className="tl-value">{nfInt.format(r.salesCount)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── 3 · Con estado (alertas de stock: Agotado / Bajo / OK) ───────────────────────────────────────
type Status = { label: string; tone: 'danger' | 'warning' | 'success' };
function alertStatus(a: { resolved: boolean; severity: 'soft' | 'critical' }): Status {
  if (a.resolved) return { label: 'OK', tone: 'success' };
  if (a.severity === 'critical') return { label: 'Agotado', tone: 'danger' };
  return { label: 'Bajo', tone: 'warning' };
}

export function StatusList({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-alerts', store],
    queryFn: () => listAlerts(store),
    placeholderData: keepPreviousData,
  });
  const rows = (q.data ?? []).slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-estado" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Estado de stock</div>
        {rows.map((a) => {
          const st = alertStatus(a);
          return (
            <div className="tl-row" key={a.id}>
              <span className="tl-name">{a.productName}</span>
              <span className={`tl-badge tl-badge--${st.tone}`}>{st.label}</span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── 4 · Con variación (tiendas: ▲/▼ del delta vs. ayer) ──────────────────────────────────────────
export function VariationList({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const rows = [...(q.data?.byStore ?? [])]
    .filter((r) => ok(r.deltaPct))
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))
    .slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-variacion" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Variación por tienda</div>
        {rows.map((r) => {
          const up = (r.deltaPct ?? 0) >= 0;
          return (
            <div className="tl-row" key={r.storeId}>
              <span className="tl-name">{r.storeName}</span>
              <span className={`tl-delta tl-delta--${up ? 'up' : 'down'}`}>
                {up ? '▲' : '▼'} {nf1.format(Math.abs(r.deltaPct ?? 0))}%
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── 5 · Ranking (productos más vendidos: puesto + facturación) ───────────────────────────────────
export function RankingList({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
  });
  const rows = (q.data?.topSales ?? []).slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-ranking" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Ranking de productos</div>
        {rows.map((p, i) => (
          <div className="tl-row--plain" key={p.productId}>
            <span className={`tl-rank${i === 0 ? ' tl-rank--top' : ''}`}>{i + 1}</span>
            <span className="tl-name">{p.name}</span>
            <span className="tl-value">{nfEur0.format(p.total)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── 6 · Reposición de stock (alertas: estado Pendiente / Repuesto) ────────────────────────────────
// Es un REFLEJO de estado, no un checklist accionable: las alertas se resuelven solas en el backend
// (`reevaluate_alert`) al reponer stock; no hay endpoint para marcarlas a mano. Por eso mostramos una
// píldora de estado (Pendiente/Repuesto), no una casilla clicable. Pendientes primero.
export function TaskList({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-alerts', store],
    queryFn: () => listAlerts(store),
    placeholderData: keepPreviousData,
  });
  const rows = [...(q.data ?? [])]
    .sort((a, b) => Number(a.resolved) - Number(b.resolved))
    .slice(0, MAX_ROWS);

  return (
    <PanelShell id="tabla-tareas" fit="stretch" bare>
      <div className="tl-card">
        <div className="tl-title">Reposición de stock</div>
        {rows.map((a) => (
          <div className="tl-row" key={a.id}>
            <span className="tl-name">{a.productName}</span>
            <span className={`tl-badge tl-badge--${a.resolved ? 'success' : 'warning'}`}>
              {a.resolved ? 'Repuesto' : 'Pendiente'}
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
