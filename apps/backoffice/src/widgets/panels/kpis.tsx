import './kpi-grid.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { useSparkScrub } from '../../hooks/use-spark-scrub.js';
import type { DashboardPeriod, MarginKpis, SalesKpis } from '../../lib/dashboard.js';
import {
  getMarginKpis,
  getMarginKpisRange,
  getSalesKpis,
  getSalesKpisRange,
  getStockoutKpis,
} from '../../lib/dashboard.js';
import { historyWindow, maxBackOffset } from '../../lib/kpi-history.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// ── Formato es-ES (replica el handoff: «63.526,52 €», «59,8 %», «3,89», «762») ──
const nfEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const nfDec = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfPct = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nfInt = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const eur = (v?: number | null): string => (ok(v) ? nfEur.format(v) : '—');
const dec = (v?: number | null): string => (ok(v) ? nfDec.format(v) : '—');
const pct = (v?: number | null): string => (ok(v) ? nfPct.format(v) : '—');

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

type ChipTone = 'neutral' | 'success' | 'danger';
type SparkTone = 'brand' | 'danger' | 'neutral';
interface Chip {
  text: string;
  tone: ChipTone;
}

// Variación primer→último de la serie, en %.
function pctDelta(series?: number[]): number | null {
  if (!series || series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (!ok(first) || !ok(last) || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

// Chip de delta con flecha (verde si sube, rojo si baja) — como en el handoff.
function deltaChip(series?: number[]): Chip | null {
  const d = pctDelta(series);
  if (d == null) return null;
  const arrow = d >= 0 ? '↑' : '↓';
  return { text: `${arrow} ${nf1.format(Math.abs(d))} %`, tone: d >= 0 ? 'success' : 'danger' };
}

// Chip de variación en puntos porcentuales (neutro) — p. ej. «−0,2 pp» del % de margen (series = ratios).
function ppChip(series?: number[]): Chip | null {
  if (!series || series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (!ok(first) || !ok(last)) return null;
  const pp = (last - first) * 100;
  const sign = pp < 0 ? '−' : '+';
  return { text: `${sign}${nf1.format(Math.abs(pp))} pp`, tone: 'neutral' };
}

// Sparkline a sangre (viewBox 240×44, line + área). Color por sentido: sube=azul, baja=rojo.
function sparkTone(series?: number[]): SparkTone {
  const d = pctDelta(series);
  return d != null && d < 0 ? 'danger' : 'brand';
}

const STROKE: Record<SparkTone, string> = {
  brand: 'var(--ui-brand)',
  danger: 'var(--ui-danger)',
  neutral: 'var(--ui-text-soft)',
};
const FILL: Record<SparkTone, string> = {
  brand: 'var(--ui-brand-soft)',
  danger: 'color-mix(in srgb, var(--ui-danger) 7%, transparent)',
  neutral: 'color-mix(in srgb, var(--ui-text-soft) 10%, transparent)',
};

function Spark({ series, tone }: { series: number[]; tone: SparkTone }): ReactElement | null {
  const pts = series.filter(ok);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const X = 240;
  const yTop = 6;
  const yBot = 38;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * X;
    const y = yBot - ((v - min) / span) * (yBot - yTop);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${coords.join(' L')}`;
  const area = `${line} L${X},44 L0,44 Z`;
  return (
    <svg className="kw-spark" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={FILL[tone]} />
      <path
        d={line}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Cell({
  label,
  value,
  chip,
  spark,
}: {
  label: string;
  value: string;
  chip?: Chip | null;
  spark?: { series: number[]; tone: SparkTone } | null;
}): ReactElement {
  return (
    <div className="kw-cell">
      <span className="kw-label">{label}</span>
      <span className="kw-value">{value}</span>
      {chip ? <span className={`kw-chip kw-chip--${chip.tone}`}>{chip.text}</span> : null}
      {spark ? <Spark series={spark.series} tone={spark.tone} /> : null}
    </div>
  );
}

// Icono del botón de reinicio: flecha circular antihoraria («volver al ahora»).
function ResetIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M3.6 8a4.4 4.4 0 1 0 1.3-3.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2.3 3.1v2.7h2.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Datos por ventana ──────────────────────────────────────────────────────────
// offset 0 reutiliza la queryKey del periodo en vivo (caché compartida con el resto de la rejilla,
// sin fetch extra); offset ≥ 1 trae la ventana histórica completa vía rango `custom`.
interface WindowQuery<T> {
  data: T | undefined;
  isFetching: boolean;
}

function useSalesWindow(
  period: DashboardPeriod,
  store: string | undefined,
  offset: number,
): WindowQuery<SalesKpis> {
  const win = offset > 0 ? historyWindow(period, offset) : null;
  const q = useQuery({
    queryKey: win
      ? ['dash-sales-kpis', 'custom', win.from, win.to, store]
      : ['dash-sales-kpis', period, store],
    queryFn: () => (win ? getSalesKpisRange(win.from, win.to, store) : getSalesKpis(period, store)),
    placeholderData: keepPreviousData,
  });
  return { data: q.data, isFetching: q.isFetching };
}

function useMarginWindow(
  period: DashboardPeriod,
  store: string | undefined,
  offset: number,
): WindowQuery<MarginKpis> {
  const win = offset > 0 ? historyWindow(period, offset) : null;
  const q = useQuery({
    queryKey: win
      ? ['dash-margin', 'custom', win.from, win.to, store]
      : ['dash-margin', period, store],
    queryFn: () =>
      win ? getMarginKpisRange(win.from, win.to, store) : getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  return { data: q.data, isFetching: q.isFetching };
}

// Celda de KPI con "scrub temporal": arrastra a la izquierda (o flechas) para recorrer ventanas
// pasadas; cuando no estás en la actual, una etiqueta y un botón de reinicio aparecen en la esquina.
interface HistoricCellProps {
  label: string;
  period: DashboardPeriod;
  store?: string | undefined;
  source: 'sales' | 'margin';
  pickValue: (sales?: SalesKpis, margin?: MarginKpis) => number | null | undefined;
  pickSeries: (sales?: SalesKpis, margin?: MarginKpis) => number[] | undefined;
  format: (v?: number | null) => string;
  chip: (series?: number[]) => Chip | null;
  staticTone?: SparkTone;
}

function HistoricCell({
  label,
  period,
  store,
  source,
  pickValue,
  pickSeries,
  format,
  chip,
  staticTone,
}: HistoricCellProps): ReactElement {
  const maxBack = maxBackOffset(period);
  const scrub = useSparkScrub(maxBack);
  const sales = useSalesWindow(period, store, source === 'sales' ? scrub.offset : 0);
  const margin = useMarginWindow(period, store, source === 'margin' ? scrub.offset : 0);

  const active = source === 'sales' ? sales : margin;
  const value = pickValue(sales.data, margin.data);
  const series = pickSeries(sales.data, margin.data);
  const points = series?.filter(ok) ?? [];
  const tone = staticTone ?? sparkTone(series);
  const win = scrub.offset > 0 ? historyWindow(period, scrub.offset) : null;
  const c = chip(series);
  // Mientras llega una ventana histórica nueva, `keepPreviousData` muestra la anterior: atenúa el
  // dato para que no se lea junto a la etiqueta de la ventana destino (evita el desajuste temporal).
  const stale = active.isFetching && scrub.offset > 0;

  return (
    <div
      className={cx(
        'kw-cell',
        'kw-cell--scrub',
        scrub.dragging && 'is-dragging',
        win && 'is-historic',
        stale && 'is-fetching',
      )}
      role="slider"
      tabIndex={0}
      aria-label={`${label}, histórico`}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={maxBack}
      aria-valuenow={scrub.offset}
      aria-valuetext={win ? win.label : 'Periodo actual'}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          scrub.stepBack();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          scrub.stepForward();
        } else if ((e.key === 'Home' || e.key === 'Escape') && scrub.offset > 0) {
          e.preventDefault();
          e.stopPropagation();
          scrub.reset();
        }
      }}
      {...scrub.handlers}
    >
      <span className="kw-label">{label}</span>
      {win ? (
        <span className="kw-when">
          <span className="kw-when-label">{win.label}</span>
          <button
            type="button"
            data-spark-reset
            className="kw-reset"
            onClick={scrub.reset}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Volver al periodo actual"
            title="Volver al periodo actual"
          >
            <ResetIcon />
          </button>
        </span>
      ) : (
        <span className="kw-scrub-hint" aria-hidden="true">
          ‹ historial
        </span>
      )}
      <span className="kw-value">{format(value)}</span>
      {c ? <span className={`kw-chip kw-chip--${c.tone}`}>{c.text}</span> : null}
      {points.length >= 2 ? (
        <Spark series={series ?? []} tone={tone} />
      ) : win ? (
        <span className="kw-spark kw-spark--empty">sin datos</span>
      ) : null}
    </div>
  );
}

// Sección 01 · Rejilla conectada de 6 KPIs — réplica del handoff: hairlines de 1px como divisores,
// cifra tabular, chip de delta y sparkline a sangre coloreado por sentido. Las 4 celdas con serie
// (Ticket medio, Uds./ticket, % Margen, Beneficio) llevan scrub histórico; Facturación y Venta
// perdida no tienen serie diaria en la API → sin sparkline ni scrub.
export function ConnectedKpiGrid({ period, store }: PanelProps): ReactElement {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const stockout = useQuery({
    queryKey: ['dash-stockout', period, store],
    queryFn: () => getStockoutKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = sales.data;
  const so = stockout.data;

  return (
    <PanelShell id="kpi-grid-connected" fit="stretch" bare>
      <div className="kw-grid">
        <Cell
          label="Facturación"
          value={eur(s?.revenue)}
          chip={s ? { text: `${nfInt.format(s.salesCount)} tickets`, tone: 'neutral' } : null}
        />
        <HistoricCell
          label="Ticket medio"
          period={period}
          store={store}
          source="sales"
          pickValue={(sd) => sd?.avgTicket}
          pickSeries={(sd) => sd?.series?.avgTicket}
          format={eur}
          chip={deltaChip}
        />
        <HistoricCell
          label="Uds. / ticket"
          period={period}
          store={store}
          source="sales"
          pickValue={(sd) => sd?.upt}
          pickSeries={(sd) => sd?.series?.upt}
          format={dec}
          chip={deltaChip}
        />
        <HistoricCell
          label="% Margen"
          period={period}
          store={store}
          source="margin"
          pickValue={(_, md) => md?.marginPct}
          pickSeries={(_, md) => md?.series}
          format={pct}
          chip={ppChip}
          staticTone="neutral"
        />
        <HistoricCell
          label="Beneficio"
          period={period}
          store={store}
          source="margin"
          pickValue={(_, md) => md?.realMargin}
          pickSeries={(_, md) => md?.realMarginSeries}
          format={eur}
          chip={deltaChip}
        />
        <Cell
          label="Venta perdida est."
          value={eur(so?.estimatedLostSales)}
          chip={so ? { text: `${nfInt.format(so.open)} roturas`, tone: 'danger' } : null}
        />
      </div>
    </PanelShell>
  );
}

// Sección 01 · Tarjeta clásica (tratamiento A) — borde + radio, cifra grande y chip. Facturación del
// periodo (sin serie diaria → sin sparkline; ver nota arriba).
export function ClassicKpiCard({ period, store }: PanelProps): ReactElement {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = sales.data;

  return (
    <PanelShell id="kpi-classic" fit="stretch" bare>
      <div className="kw-card">
        <span className="kw-label">Facturación</span>
        <span className="kw-value">{eur(s?.revenue)}</span>
        {s ? (
          <span className="kw-chip kw-chip--neutral">{nfInt.format(s.salesCount)} tickets</span>
        ) : null}
      </div>
    </PanelShell>
  );
}
