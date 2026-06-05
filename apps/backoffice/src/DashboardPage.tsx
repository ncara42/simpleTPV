import './dashboard.css';

import { Select } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { deltaTone, fmtDelta, fmtEur, fmtEurCompact, fmtNum, fmtRate } from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';

const PERIODS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

// Subtítulo de panel según el periodo seleccionado (más claro que "Periodo actual").
const PERIOD_SUBTITLE: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  month: 'Este mes',
};

// Tintes de respaldo (escala azul Apple + neutros) cuando una familia no
// trae color propio. Mantiene el lienzo monocromo y sobrio.
const PIE_FALLBACK = ['#0066cc', '#2997ff', '#5ac8fa', '#86868b', '#0a5ac4', '#1d1d1f', '#a1a1a6'];

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [storeId, setStoreId] = useState('');
  const store = storeId || undefined;

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  // placeholderData: al cambiar de tienda/periodo se conservan los datos previos
  // durante el refetch en vez de vaciarse. Así los nodos del DOM (key estable por
  // tienda/familia) persisten y las gráficas no vuelven a montar ni re-animan.
  const salesToday = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const salesKpis = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const marginKpis = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const byFamily = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const rankings = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
  });

  usePageHeader('Resumen', 'Actualizado hace 2 min');

  return (
    <section className="catalog" data-testid="dashboard">
      <header className="catalog-head is-actions-only">
        <div className="catalog-actions">
          <Select
            className="dash-period-select"
            value={period}
            onChange={(value) => setPeriod(value as DashboardPeriod)}
            ariaLabel="Periodo"
            data-testid="dash-period"
            options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <Select
            className="dash-store"
            value={storeId}
            onChange={setStoreId}
            ariaLabel="Tienda"
            data-testid="dash-store"
            options={[
              { value: '', label: 'Todas las tiendas' },
              ...stores.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
      </header>

      {/* KPI cards */}
      <div className="dash-cards" data-testid="dash-cards">
        <KpiCard
          label="Facturación hoy"
          value={fmtEur(salesToday.data?.today.total)}
          delta={salesToday.data?.deltaPct ?? null}
          series={salesToday.data?.series}
          sparkTone={deltaTone(salesToday.data?.deltaPct ?? null) === 'down' ? 'down' : 'up'}
          testid="kpi-today"
        />
        <KpiCard
          label="Ticket medio"
          value={fmtEur(salesKpis.data?.avgTicket)}
          series={salesKpis.data?.series?.avgTicket}
          testid="kpi-avg-ticket"
        />
        <KpiCard
          label="UPT"
          value={fmtNum(salesKpis.data?.upt)}
          series={salesKpis.data?.series?.upt}
          testid="kpi-upt"
        />
        <KpiCard
          label="% Margen"
          value={fmtRate(marginKpis.data?.marginPct)}
          series={marginKpis.data?.series}
          testid="kpi-margin"
        />
        <KpiCard
          label="Tasa descuento"
          value={fmtRate(salesKpis.data?.discountRate)}
          series={salesKpis.data?.series?.discountRate}
          testid="kpi-discount"
        />
        <KpiCard
          label="Tasa devolución"
          value={fmtRate(salesKpis.data?.returnRate)}
          series={salesKpis.data?.series?.returnRate}
          testid="kpi-return"
        />
      </div>

      <div className="dash-grid">
        {/* Ventas hoy vs ayer por tienda (líneas + área, coherente con las sparklines) */}
        <div className="dash-panel span-7" data-testid="dash-bars">
          <h3>Ventas hoy vs ayer</h3>
          <p className="dash-panel-sub">Facturación neta por tienda</p>
          {(() => {
            const stores = salesToday.data?.byStore ?? [];
            // Escala a la facturación máxima (Hoy o Ayer) de cualquier tienda → la
            // barra más alta llena el lienzo y las alturas comparan de un vistazo.
            const top = Math.max(1, ...stores.flatMap((s) => [s.today, s.yesterday]));
            // Si la tienda del filtro está en el gráfico, se resalta su columna y
            // se atenúan las demás (mismo gesto que el hover).
            const focused = !!storeId && stores.some((s) => s.storeId === storeId);
            return (
              <>
                <div className={`dash-bars-chart${focused ? ' has-selection' : ''}`}>
                  {stores.map((s, i) => {
                    const tone = deltaTone(s.deltaPct);
                    return (
                      <div
                        className={`dash-bars-group${s.storeId === storeId ? ' is-selected' : ''}`}
                        key={s.storeId}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <div className="dash-bars-cap">
                          <strong className="dash-bars-cap-val">{fmtEur(s.today)}</strong>
                          <span className={`dash-bars-cap-delta dash-delta-${tone}`}>
                            {fmtDelta(s.deltaPct)}
                          </span>
                        </div>
                        <div className="dash-bars-pair">
                          <span
                            className="dash-bars-bar dash-bars-bar-prev"
                            style={{ height: `${(s.yesterday / top) * 100}%` }}
                          >
                            <span className="dash-bars-bar-val">{fmtEurCompact(s.yesterday)}</span>
                          </span>
                          <span
                            className="dash-bars-bar dash-bars-bar-now"
                            style={{ height: `${(s.today / top) * 100}%` }}
                          >
                            <span className="dash-bars-bar-val">{fmtEurCompact(s.today)}</span>
                          </span>
                        </div>
                        <span className="dash-bars-name">{s.storeName}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dash-bars-legend">
                  <span>
                    <span className="dash-legend-dot dash-swatch-prev" /> Ayer
                  </span>
                  <span>
                    <span className="dash-legend-dot dash-swatch-now" /> Hoy
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Ventas por familia (barras CSS horizontales) */}
        <div className="dash-panel span-5" data-testid="dash-family">
          <h3>Ventas por familia</h3>
          <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]}</p>
          {(() => {
            const fams = byFamily.data ?? [];
            const max = Math.max(1, ...fams.map((f) => f.total));
            return (
              <ul className="dash-family-list">
                {fams.map((f, i) => {
                  return (
                    <li key={f.familyId ?? `none-${i}`} style={{ '--i': i } as React.CSSProperties}>
                      <span className="dash-family-name">{f.familyName}</span>
                      <span className="dash-family-track">
                        <span
                          className="dash-family-fill"
                          style={{ width: `${(f.total / max) * 100}%` }}
                        >
                          <span className="dash-family-pct">{fmtEur(f.total)}</span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>

        {/* Panel de roturas */}
        <div className="dash-panel span-5" data-testid="dash-stockout">
          <h3>Roturas de stock</h3>
          <p className="dash-panel-sub">Productos en alerta ahora</p>
          <ul className="dash-stockout-list">
            {DEMO_STOCKOUTS.map((s) => (
              <li key={`${s.name}-${s.store}`} className={`dash-stockout-item lvl-${s.level}`}>
                <span className="dash-stockout-info">
                  <span className="dash-stockout-name">{s.name}</span>
                  <span className="dash-stockout-store">{s.store}</span>
                </span>
                <span className="dash-stockout-tag">{s.qty} ud</span>
              </li>
            ))}
          </ul>
          <div className="dash-stockout-foot">
            <span>Venta perdida est.</span>
            <strong className="dash-lost">{fmtEur(DEMO_STOCKOUT_KPIS.estimatedLostSales)}</strong>
          </div>
        </div>

        {/* Rankings */}
        <div className="dash-panel span-7" data-testid="dash-rankings">
          <Rankings data={rankings.data} loading={rankings.isLoading} />
        </div>
      </div>
    </section>
  );
}

type SparkTone = 'brand' | 'up' | 'down';

function KpiCard(props: {
  label: string;
  value: string;
  delta?: number | null;
  series?: number[] | undefined;
  sparkTone?: SparkTone;
  testid: string;
}) {
  const tone = deltaTone(props.delta);
  return (
    <div className="dash-card-wrap">
      {props.delta !== undefined && (
        <span className={`dash-card-trend dash-trend-${tone}`}>{fmtDelta(props.delta)}</span>
      )}
      <div className="dash-card" data-testid={props.testid}>
        <span className="dash-card-label">{props.label}</span>
        <span className="dash-card-value">{props.value}</span>
        {props.series && props.series.length > 1 && (
          <Sparkline data={props.series} tone={props.sparkTone ?? 'brand'} />
        )}
      </div>
    </div>
  );
}

// Mini-gráfica de tendencia para la card. SVG a mano (como las barras del dashboard),
// estirado a todo el ancho con preserveAspectRatio="none"; el trazo se mantiene fino
// gracias a vector-effect. El color (línea + relleno) lo fija la clase de tono.
function Sparkline(props: { data: number[]; tone?: SparkTone }) {
  const { data } = props;
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 3; // margen vertical para que el trazo no toque los bordes
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = pad + (1 - (v - min) / span) * (32 - 2 * pad);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `M ${points[0]![0].toFixed(2)},${points[0]![1].toFixed(2)} L ${line} L 100,32 L 0,32 Z`;
  return (
    <svg
      className={`dash-card-spark dash-spark-${props.tone ?? 'brand'}`}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path className="dash-spark-area" d={area} />
      <polyline className="dash-spark-line" points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type RankTab = 'sales' | 'margin' | 'rotation';

const RANK_OPTIONS = [
  { value: 'sales', label: 'Top ventas' },
  { value: 'margin', label: 'Top margen' },
  { value: 'rotation', label: 'Peor rotación' },
];

function Rankings(props: {
  data: import('./lib/dashboard.js').ProductRankings | undefined;
  loading: boolean;
}) {
  const [tab, setTab] = useState<RankTab>('sales');
  if (props.loading) {
    return (
      <>
        <header className="dash-panel-head">
          <h3>Rankings de producto</h3>
          <Select
            className="dash-rank-select"
            value={tab}
            onChange={(v) => setTab(v as RankTab)}
            ariaLabel="Filtrar ranking"
            data-testid="rank-tabs"
            options={RANK_OPTIONS}
            disabled
          />
        </header>
        <p className="catalog-empty">Cargando…</p>
      </>
    );
  }
  const rows =
    tab === 'sales'
      ? (props.data?.topSales ?? []).map((r) => ({
          name: r.name,
          value: fmtEur(r.total),
          num: r.total,
        }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({
            name: r.name,
            value: fmtEur(r.margin),
            num: r.margin,
          }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            name: r.name,
            value: `${fmtNum(r.units, 0)} ud`,
            num: r.units,
          }));
  const max = Math.max(1, ...rows.map((r) => r.num));

  return (
    <>
      <header className="dash-panel-head">
        <h3>Rankings de producto</h3>
        <Select
          className="dash-rank-select"
          value={tab}
          onChange={(v) => setTab(v as RankTab)}
          ariaLabel="Filtrar ranking"
          data-testid="rank-tabs"
          options={RANK_OPTIONS}
        />
      </header>
      {rows.length === 0 ? (
        <p className="catalog-empty">Sin datos.</p>
      ) : (
        <ol className="dash-rank-list" data-testid="rank-table">
          {rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="dash-rank-row"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="dash-rank-pos">{i + 1}</span>
              <span className="dash-rank-name">{r.name}</span>
              <span className="dash-rank-value">{r.value}</span>
              <span
                className="dash-rank-meter"
                style={{ '--w': `${(r.num / max) * 100}%` } as React.CSSProperties}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
