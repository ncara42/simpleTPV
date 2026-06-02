import './dashboard.css';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DEMO_STOCKOUT_KPIS, DEMO_STOCKOUTS } from './demo/demoData.js';
import { listStores } from './lib/admin.js';
import {
  type DashboardPeriod,
  getMarginKpis,
  getProductRankings,
  getSalesByFamily,
  getSalesKpis,
  getSalesToday,
} from './lib/dashboard.js';
import { deltaTone, fmtDelta, fmtEur, fmtNum, fmtRate } from './lib/format.js';

const PERIODS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

// Paleta para tartas cuando una familia no trae color propio.
const PIE_FALLBACK = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [storeId, setStoreId] = useState('');
  const store = storeId || undefined;

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  const salesToday = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
  });
  const salesKpis = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
  });
  const marginKpis = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
  });
  const byFamily = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
  });
  const rankings = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
  });

  return (
    <section className="catalog" data-testid="dashboard">
      <header className="catalog-head">
        <div>
          <h2>Resumen de hoy</h2>
          <p className="catalog-sub">Última actualización hace 2 min</p>
        </div>
        <div className="catalog-actions">
          <nav className="bo-tabs dash-period" data-testid="dash-period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={`bo-tab ${period === p.id ? 'active' : ''}`}
                onClick={() => setPeriod(p.id)}
                data-testid={`dash-period-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </nav>
          <select
            className="catalog-search"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            data-testid="dash-store"
          >
            <option value="">Todas las tiendas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* KPI cards */}
      <div className="dash-cards" data-testid="dash-cards">
        <KpiCard
          label="Facturación hoy"
          value={fmtEur(salesToday.data?.today.total)}
          delta={salesToday.data?.deltaPct ?? null}
          testid="kpi-today"
        />
        <KpiCard
          label="Ticket medio"
          value={fmtEur(salesKpis.data?.avgTicket)}
          testid="kpi-avg-ticket"
        />
        <KpiCard label="UPT" value={fmtNum(salesKpis.data?.upt)} testid="kpi-upt" />
        <KpiCard label="% Margen" value={fmtRate(marginKpis.data?.marginPct)} testid="kpi-margin" />
        <KpiCard
          label="Tasa descuento"
          value={fmtRate(salesKpis.data?.discountRate)}
          testid="kpi-discount"
        />
        <KpiCard
          label="Tasa devolución"
          value={fmtRate(salesKpis.data?.returnRate)}
          testid="kpi-return"
        />
      </div>

      <div className="dash-grid">
        {/* Ventas hoy vs ayer por tienda (barras CSS verticales) */}
        <div className="dash-panel" data-testid="dash-bars">
          <h3>Ventas hoy vs ayer</h3>
          <p className="dash-panel-sub">Facturación neta por tienda</p>
          {(() => {
            const stores = salesToday.data?.byStore ?? [];
            const max = Math.max(1, ...stores.flatMap((s) => [s.today, s.yesterday]));
            return (
              <>
                <div className="dash-bars-chart">
                  {stores.map((s) => (
                    <div className="dash-bars-group" key={s.storeId}>
                      <div className="dash-bars-pair">
                        <span
                          className="dash-bar dash-bar-prev"
                          style={{ height: `${(s.yesterday / max) * 100}%` }}
                          title={`Ayer: ${fmtEur(s.yesterday)}`}
                        />
                        <span
                          className="dash-bar dash-bar-now"
                          style={{ height: `${(s.today / max) * 100}%` }}
                          title={`Hoy: ${fmtEur(s.today)}`}
                        />
                      </div>
                      <span className="dash-bars-label">{s.storeName}</span>
                    </div>
                  ))}
                </div>
                <div className="dash-bars-legend">
                  <span>
                    <span className="dash-legend-dot dash-bar-prev" /> Ayer
                  </span>
                  <span>
                    <span className="dash-legend-dot dash-bar-now" /> Hoy
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Ventas por familia (barras CSS horizontales) */}
        <div className="dash-panel" data-testid="dash-family">
          <h3>Ventas por familia</h3>
          <p className="dash-panel-sub">Periodo actual</p>
          {(() => {
            const fams = byFamily.data ?? [];
            const max = Math.max(1, ...fams.map((f) => f.total));
            return (
              <ul className="dash-family-list">
                {fams.map((f, i) => (
                  <li key={f.familyId ?? `none-${i}`}>
                    <span className="dash-family-name">{f.familyName}</span>
                    <span className="dash-family-track">
                      <span
                        className="dash-family-fill"
                        style={{
                          width: `${(f.total / max) * 100}%`,
                          background: f.color ?? PIE_FALLBACK[i % PIE_FALLBACK.length] ?? '#16734f',
                        }}
                      />
                    </span>
                    <span className="dash-family-value">{fmtEur(f.total)}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>

        {/* Panel de roturas */}
        <div className="dash-panel" data-testid="dash-stockout">
          <h3>Roturas de stock</h3>
          <p className="dash-panel-sub">Productos en alerta ahora</p>
          <ul className="dash-stockout-list">
            {DEMO_STOCKOUTS.map((s) => (
              <li key={`${s.name}-${s.store}`}>
                <span className={`stock-dot stock-${s.level}`} />
                <span className="dash-stockout-name">{s.name}</span>
                <span className="dash-stockout-store">
                  {s.store} · {s.qty} ud
                </span>
              </li>
            ))}
          </ul>
          <div className="dash-stockout-foot">
            <span>Venta perdida est.</span>
            <strong className="dash-lost">{fmtEur(DEMO_STOCKOUT_KPIS.estimatedLostSales)}</strong>
          </div>
        </div>

        {/* Rankings */}
        <div className="dash-panel" data-testid="dash-rankings">
          <Rankings data={rankings.data} loading={rankings.isLoading} />
        </div>
      </div>
    </section>
  );
}

function KpiCard(props: { label: string; value: string; delta?: number | null; testid: string }) {
  const tone = deltaTone(props.delta);
  return (
    <div className="dash-card" data-testid={props.testid}>
      <span className="dash-card-label">{props.label}</span>
      <span className="dash-card-value">{props.value}</span>
      {props.delta !== undefined && (
        <span className={`dash-card-delta dash-delta-${tone}`}>{fmtDelta(props.delta)}</span>
      )}
    </div>
  );
}

type RankTab = 'sales' | 'margin' | 'rotation';

function Rankings(props: {
  data: import('./lib/dashboard.js').ProductRankings | undefined;
  loading: boolean;
}) {
  const [tab, setTab] = useState<RankTab>('sales');
  if (props.loading) {
    return (
      <>
        <h3>Rankings de producto</h3>
        <p className="catalog-empty">Cargando…</p>
      </>
    );
  }
  const rows =
    tab === 'sales'
      ? (props.data?.topSales ?? []).map((r) => ({ name: r.name, value: fmtEur(r.total) }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({ name: r.name, value: fmtEur(r.margin) }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            name: r.name,
            value: `${fmtNum(r.units, 0)} ud`,
          }));

  return (
    <>
      <h3>Rankings de producto</h3>
      <nav className="bo-tabs" data-testid="rank-tabs">
        <button
          className={`bo-tab ${tab === 'sales' ? 'active' : ''}`}
          onClick={() => setTab('sales')}
          data-testid="rank-sales"
        >
          Top ventas
        </button>
        <button
          className={`bo-tab ${tab === 'margin' ? 'active' : ''}`}
          onClick={() => setTab('margin')}
          data-testid="rank-margin"
        >
          Top margen
        </button>
        <button
          className={`bo-tab ${tab === 'rotation' ? 'active' : ''}`}
          onClick={() => setTab('rotation')}
          data-testid="rank-rotation"
        >
          Peor rotación
        </button>
      </nav>
      {rows.length === 0 ? (
        <p className="catalog-empty">Sin datos.</p>
      ) : (
        <table className="catalog-table" data-testid="rank-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td>{r.name}</td>
                <td className="dash-rank-value">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
