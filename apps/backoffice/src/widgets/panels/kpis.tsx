import './kpi-grid.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getMarginKpis, getSalesKpis, getStockoutKpis } from '../../lib/dashboard.js';
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

function useKpiData(period: PanelProps['period'], store: PanelProps['store']) {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const margin = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const stockout = useQuery({
    queryKey: ['dash-stockout', period, store],
    queryFn: () => getStockoutKpis(period, store),
    placeholderData: keepPreviousData,
  });
  return { sales, margin, stockout };
}

// Sección 01 · Rejilla conectada de 6 KPIs — réplica del handoff: hairlines de 1px como divisores,
// cifra tabular, chip de delta y sparkline a sangre coloreado por sentido. (Facturación y Venta perdida
// no tienen serie diaria en la API → sin sparkline; el resto sí.)
function buildSpark(
  series?: number[],
  tone?: SparkTone,
): { series: number[]; tone: SparkTone } | null {
  if (!series || series.length < 2) return null;
  return { series, tone: tone ?? sparkTone(series) };
}

export function ConnectedKpiGrid({ period, store }: PanelProps): ReactElement {
  const { sales, margin, stockout } = useKpiData(period, store);
  const s = sales.data;
  const m = margin.data;
  const so = stockout.data;
  const ss = s?.series;

  return (
    <PanelShell id="kpi-grid-connected" bare>
      <div className="kw-grid">
        <Cell
          label="Facturación"
          value={eur(s?.revenue)}
          chip={s ? { text: `${nfInt.format(s.salesCount)} tickets`, tone: 'neutral' } : null}
        />
        <Cell
          label="Ticket medio"
          value={eur(s?.avgTicket)}
          chip={deltaChip(ss?.avgTicket)}
          spark={buildSpark(ss?.avgTicket)}
        />
        <Cell
          label="Uds. / ticket"
          value={dec(s?.upt)}
          chip={deltaChip(ss?.upt)}
          spark={buildSpark(ss?.upt)}
        />
        <Cell
          label="% Margen"
          value={pct(m?.marginPct)}
          chip={ppChip(m?.series)}
          spark={buildSpark(m?.series, 'neutral')}
        />
        <Cell
          label="Beneficio"
          value={eur(m?.realMargin)}
          chip={deltaChip(m?.realMarginSeries)}
          spark={buildSpark(m?.realMarginSeries)}
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

// Sección 01 · Tarjeta clásica (tratamiento A) — borde + radio, etiqueta de esquina «A · CLÁSICA»,
// cifra grande y chip. Facturación del periodo (sin serie diaria → sin sparkline; ver nota arriba).
export function ClassicKpiCard({ period, store }: PanelProps): ReactElement {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = sales.data;

  return (
    <PanelShell id="kpi-classic" fill bare>
      <div className="kw-card">
        <span className="kw-corner">A · Clásica</span>
        <span className="kw-label">Facturación</span>
        <span className="kw-value">{eur(s?.revenue)}</span>
        {s ? (
          <span className="kw-chip kw-chip--neutral">{nfInt.format(s.salesCount)} tickets</span>
        ) : null}
      </div>
    </PanelShell>
  );
}
