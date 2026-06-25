import {
  ActivityFeed,
  type ActivityItem,
  BulletMeter,
  DonutStat,
  Gauge,
  HeatStrip,
  HeroFigure,
  KpiDual,
  KpiGrid,
  KpiStat,
  Leaderboard,
  ProjectionArea,
  RibbonStat,
  ShareBar,
  SparkArea,
  SparkBars,
  Treemap,
} from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  type DashboardPeriod,
  getMarginKpis,
  getProductRankings,
  getSalesByEmployee,
  getSalesByFamily,
  getSalesByHourOnDay,
  getSalesKpis,
  getSalesToday,
} from '../../lib/dashboard.js';
import { listAlerts } from '../../lib/stock.js';
import { GEIST_WIDGET_META } from './meta.js';

// Render de los widgets «Geist» (#264): cada molécula dataviz de @simpletpv/ui montada como un widget
// fijo autónomo del dashboard. A diferencia de las tarjetas/paneles clásicos (cuyo fetch vive en
// DashboardPage gateado por `vis`), cada widget Geist consulta SUS datos al montarse — y solo se monta
// cuando está en el lienzo (lo invoca `renderItem`), así que el `enabled` es implícito. Reutiliza las
// MISMAS queryKeys que DashboardPage para compartir caché (sin refetch duplicado).

export interface GeistWidgetProps {
  period: DashboardPeriod;
  store?: string | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

// Marco de tarjeta nativo (`.dash-panel`), igual que los paneles clásicos: rellena el tile del lienzo
// y, opcionalmente, lleva cabecera. Sin título → las moléculas que ya se autotitulan (KpiStat,
// HeroFigure, KpiDual) ocupan el panel sin cabecera redundante.
function GeistPanel({
  id,
  title,
  subtitle,
  fill = false,
  children,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  /** El cuerpo crece para llenar el alto (gráficas de área/sparkline a sangre). */
  fill?: boolean;
  children: ReactElement;
}): ReactElement {
  return (
    <div className={`dash-panel${fill ? ' dash-panel--fill' : ''}`} data-testid={id}>
      {title ? (
        <header className="dash-panel-head">
          <div className="dash-panel-titles">
            <h3>{title}</h3>
            {subtitle ? <p className="dash-panel-sub">{subtitle}</p> : null}
          </div>
        </header>
      ) : null}
      <div className="dash-geist-body">{children}</div>
    </div>
  );
}

// Suma acumulada de una serie (descarta no finitos). Para curvas «acumulado del mes».
function cumulative(series: readonly number[]): number[] {
  let acc = 0;
  return series.map((v) => (acc += Number.isFinite(v) ? v : 0));
}

// Días del mes actual (para el eje y la proyección a fin de mes).
function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Día de hoy en ISO local (YYYY-MM-DD), como el panel «Ventas por hora».
function todayIsoLocal(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// Estado de carga/error de una molécula presentacional (las que no aceptan isLoading/isError).
type LoadState = 'loading' | 'error' | undefined;
function loadState(q: { isLoading: boolean; isError: boolean }): LoadState {
  if (q.isError) return 'error';
  if (q.isLoading) return 'loading';
  return undefined;
}

// ── Widgets ──────────────────────────────────────────────────────────────────────────────────────

// 1 · KpiStat — Facturación de hoy con sparkline intradía y chip de dirección vs ayer.
function StatToday({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const delta = d?.deltaPct ?? null;
  const chip =
    delta == null
      ? undefined
      : {
          text: delta > 0 ? '↑ vs ayer' : delta < 0 ? '↓ vs ayer' : '= vs ayer',
          tone: (delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral') as
            | 'success'
            | 'danger'
            | 'neutral',
        };
  const ls = loadState(q);
  return (
    <GeistPanel id="geist-stat-today">
      <KpiStat
        label="Facturación de hoy"
        value={d?.today?.total ?? null}
        format="eur"
        {...(chip ? { chip } : {})}
        {...(d?.intraday ? { spark: d.intraday } : {})}
        sparkTone={delta != null && delta < 0 ? 'danger' : 'accent'}
        {...(ls ? { state: ls } : {})}
      />
    </GeistPanel>
  );
}

// 2 · HeroFigure — Beneficio del mes en grande + área a toda altura. Fija period='month'.
function HeroProfit({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', 'month', store],
    queryFn: () => getMarginKpis('month', store),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const marginPct = d != null && Number.isFinite(d.marginPct) ? d.marginPct * 100 : null;
  return (
    <GeistPanel id="geist-hero-profit">
      <HeroFigure
        eyebrow="Beneficio · mes"
        value={d?.realMargin ?? null}
        format="eur"
        chips={
          marginPct != null ? [{ text: `Margen ${marginPct.toFixed(1).replace('.', ',')} %` }] : []
        }
        {...(d?.realMarginSeries ? { spark: d.realMarginSeries } : {})}
      />
    </GeistPanel>
  );
}

// 3 · KpiDual — Margen % y Beneficio € apilados en una tarjeta.
function DualMargin({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  return (
    <GeistPanel id="geist-dual-margin">
      <KpiDual
        top={{ label: '% Margen', value: d?.marginPct ?? null, format: 'percentRatio' }}
        bottom={{ label: 'Beneficio', value: d?.realMargin ?? null, format: 'eur' }}
      />
    </GeistPanel>
  );
}

// 4 · RibbonStat (×3 en KpiGrid) — banda densa de métricas secundarias con mini-sparkline.
function RibbonKpis({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = q.data?.series;
  return (
    <GeistPanel id="geist-ribbon-kpis" title="Métricas clave">
      <KpiGrid columns={1}>
        <RibbonStat
          label="Ticket medio"
          value={q.data?.avgTicket ?? null}
          format="eur"
          {...(s?.avgTicket ? { aside: <SparkArea data={s.avgTicket} height={26} /> } : {})}
        />
        <RibbonStat
          label="UPT"
          value={q.data?.upt ?? null}
          format="decimal"
          {...(s?.upt ? { aside: <SparkArea data={s.upt} height={26} /> } : {})}
        />
        <RibbonStat
          label="Tasa descuento"
          value={q.data?.discountRate ?? null}
          format="percentRatio"
          {...(s?.discountRate
            ? { aside: <SparkArea data={s.discountRate} tone="danger" height={26} /> }
            : {})}
        />
      </KpiGrid>
    </GeistPanel>
  );
}

// 5 · Gauge — Medidor semicircular del % de margen sobre 0–100 (sin objetivo: rango natural).
function GaugeMargin({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const pct = q.data != null ? q.data.marginPct * 100 : Number.NaN;
  return (
    <GeistPanel id="geist-gauge-margin" title="Medidor de margen">
      <Gauge value={pct} max={100} format="percent" isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 6 · BulletMeter — Ventas de hoy contra las de ayer (objetivo = ayer; no hay objetivo configurable
// en el backend todavía — ver issue de seguimiento). Honesto: ambas cifras son reales.
function BulletSales({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  return (
    <GeistPanel id="geist-bullet-sales" title="Ventas de hoy vs ayer" subtitle="Objetivo = ayer">
      <BulletMeter
        value={d?.today?.total ?? Number.NaN}
        target={d?.yesterday?.total ?? Number.NaN}
        format="eur"
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </GeistPanel>
  );
}

// 7 · ProjectionArea — Beneficio ACUMULADO del mes + proyección a fin de mes por run-rate (el backend
// no expone forecast; la proyección se deriva del acumulado a la fecha). Fija period='month'.
function ProjectionMonth({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', 'month', store],
    queryFn: () => getMarginKpis('month', store),
    placeholderData: keepPreviousData,
  });
  const daily = q.data?.realMarginSeries ?? [];
  const actual = cumulative(daily);
  const total = daysInCurrentMonth();
  const elapsed = actual.length;
  const last = elapsed > 0 ? actual[elapsed - 1]! : 0;
  const projectionEnd = elapsed > 0 ? (last / elapsed) * total : undefined;
  return (
    <GeistPanel
      id="geist-projection-month"
      title="Beneficio acumulado del mes"
      subtitle="Proyección a fin de mes (run-rate)"
      fill
    >
      <ProjectionArea
        actual={actual}
        totalPoints={total}
        {...(projectionEnd != null ? { projectionEnd } : {})}
        height={220}
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </GeistPanel>
  );
}

// 8 · Treemap — Mapa de familias por facturación (área ∝ total).
function TreemapFamily({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? [])
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((f) => ({ label: f.familyName, value: f.total }));
  return (
    <GeistPanel id="geist-treemap-family" title="Mapa de familias" fill>
      <Treemap items={items} format="eur0" isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 9 · DonutStat — Reparto por familia con total al centro.
function DonutFamily({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const fams = (q.data ?? []).filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const items = fams.slice(0, 6).map((f) => ({ label: f.familyName, value: f.total }));
  return (
    <GeistPanel id="geist-donut-family" title="Reparto por familia">
      <DonutStat
        items={items}
        format="eur0"
        centerCaption={`${fams.length} familias`}
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </GeistPanel>
  );
}

// 10 · ShareBar — Cuota de ventas de hoy por tienda.
function ShareStores({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data?.byStore ?? [])
    .filter((s) => s.today > 0)
    .map((s) => ({ label: s.storeName, value: s.today }));
  return (
    <GeistPanel id="geist-share-stores" title="Cuota por tienda" subtitle="Ventas de hoy">
      <ShareBar items={items} isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 11 · Leaderboard — Ranking de vendedores por facturación.
function LeaderboardSellers({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-emp', period, store],
    queryFn: () => getSalesByEmployee(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((e) => ({
    label: e.userName,
    value: e.total,
    detail: `${e.salesCount} tickets`,
  }));
  return (
    <GeistPanel id="geist-leaderboard-sellers" title="Ranking de vendedores" fill>
      <Leaderboard items={items} format="eur" isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 12 · Leaderboard — Top productos por ventas.
function LeaderboardProducts({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data?.topSales ?? []).map((p) => ({
    label: p.name,
    value: p.total,
    detail: `${p.units} uds.`,
  }));
  return (
    <GeistPanel id="geist-leaderboard-products" title="Top productos por ventas" fill>
      <Leaderboard items={items} format="eur" isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 13 · HeatStrip — Mapa de calor de la facturación por hora del día de hoy.
function HeatHours({ store }: GeistWidgetProps): ReactElement {
  const day = todayIsoLocal();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((h) => ({ label: `${h.hour}h`, value: h.revenue }));
  return (
    <GeistPanel id="geist-heat-hours" title="Mapa de calor por hora" subtitle="Hoy">
      <HeatStrip items={items} isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// 14 · SparkArea — Tendencia del ticket medio a sangre.
function SparkTicket({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const series = q.data?.series?.avgTicket ?? [];
  return (
    <GeistPanel id="geist-spark-ticket" title="Tendencia de ticket medio" fill>
      <div className="dash-geist-spark">
        <SparkArea data={series} height="100%" />
      </div>
    </GeistPanel>
  );
}

// 15 · SparkBars — Beneficio por día en mini-barras (la última en acento).
function BarsProfit({ period, store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const series = q.data?.realMarginSeries ?? [];
  return (
    <GeistPanel id="geist-bars-profit" title="Beneficio por día" fill>
      <div className="dash-geist-spark">
        <SparkBars data={series} accent="last" height={120} />
      </div>
    </GeistPanel>
  );
}

// 16 · ActivityFeed — Avisos de stock recientes como línea de tiempo.
function FeedAlerts({ store }: GeistWidgetProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-alerts', store],
    queryFn: () => listAlerts(store),
    placeholderData: keepPreviousData,
  });
  const items: ActivityItem[] = (q.data ?? []).slice(0, 8).map((a) => ({
    title: (
      <>
        <strong>{a.productName}</strong> · {a.alertType}
      </>
    ),
    meta: a.storeName,
    tone: a.severity === 'critical' ? 'danger' : 'warning',
  }));
  return (
    <GeistPanel id="geist-feed-alerts" title="Avisos de stock" fill>
      <ActivityFeed items={items} isLoading={q.isLoading} isError={q.isError} />
    </GeistPanel>
  );
}

// ── Despacho ─────────────────────────────────────────────────────────────────────────────────────

const GEIST_COMPONENTS: Record<string, (props: GeistWidgetProps) => ReactElement> = {
  'geist-stat-today': StatToday,
  'geist-hero-profit': HeroProfit,
  'geist-dual-margin': DualMargin,
  'geist-ribbon-kpis': RibbonKpis,
  'geist-gauge-margin': GaugeMargin,
  'geist-bullet-sales': BulletSales,
  'geist-projection-month': ProjectionMonth,
  'geist-treemap-family': TreemapFamily,
  'geist-donut-family': DonutFamily,
  'geist-share-stores': ShareStores,
  'geist-leaderboard-sellers': LeaderboardSellers,
  'geist-leaderboard-products': LeaderboardProducts,
  'geist-heat-hours': HeatHours,
  'geist-spark-ticket': SparkTicket,
  'geist-bars-profit': BarsProfit,
  'geist-feed-alerts': FeedAlerts,
};

// Render de un widget Geist por id. Devuelve null si el id no es Geist (el llamador encadena con el
// resto del catálogo). El propio `GEIST_COMPONENTS` es la lista de verdad del render; `meta.ts` la del
// catálogo/tamaño/etiqueta — un test verifica que coinciden.
export function GeistWidget({
  id,
  period,
  store,
}: {
  id: string;
  period: DashboardPeriod;
  store?: string | undefined;
}): ReactElement | null {
  const Component = GEIST_COMPONENTS[id];
  if (!Component) return null;
  return <Component period={period} store={store} />;
}

// Expone los ids con render (para el test de paridad con meta.ts).
export const GEIST_RENDER_IDS: readonly string[] = Object.keys(GEIST_COMPONENTS);

// Re-export para los consumidores del catálogo.
export { GEIST_WIDGET_META };
