import './mini.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  getMarginKpis,
  getSalesByFamily,
  getSalesByHourOnDay,
  getSalesKpis,
  getSalesToday,
} from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// ── Utilidades comunes ──────────────────────────────────────────────────────
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat('es-ES');
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Día de hoy (local) como 'YYYY-MM-DD' — mismo criterio que «Ventas por hora» y graf-heatmap.
function todayLocalIso(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// Color de la rampa azul monocroma por intensidad t∈[0,1] (acento→superficie). Mismo recurso que
// la galería y las miniaturas: se adapta a claro/oscuro sin hex.
function rampFill(t: number): string {
  const pct = Math.round(8 + clamp01(t) * 92);
  return `color-mix(in oklab, var(--ui-brand) ${pct}%, var(--ui-surface))`;
}

// Polilínea (viewBox 240×80) a partir de una serie: x repartido uniforme, y normalizado al rango.
function linePath(series: number[]): { line: string; lastX: number; lastY: number } | null {
  const pts = series.filter(ok);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const yTop = 8;
  const yBot = 72;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * 240;
    const y = yBot - ((v - min) / span) * (yBot - yTop);
    return [x, y] as const;
  });
  const line = `M${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
  const last = coords[coords.length - 1]!;
  return { line, lastX: last[0], lastY: last[1] };
}

// Estados de carga: las tarjetas a medida no muestran spinner; con datos vacíos pintan el armazón.

// ── 1 · Barras · tiendas (getSalesToday.byStore: facturación de hoy por tienda, top 5) ───────────
export function MiniStoreBars({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const rows = [...(q.data?.byStore ?? [])].sort((a, b) => b.today - a.today).slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.today));

  return (
    <PanelShell id="mini-tiendas" bare>
      <div className="mw-card">
        <div className="mw-label">Barras · tiendas</div>
        <div className="mw-bars">
          {rows.map((r, i) => (
            <span
              key={r.storeId}
              className={i < 3 ? undefined : 'is-soft'}
              style={{ height: `${Math.max(4, (r.today / max) * 100)}%` }}
              title={`${r.storeName}: ${nfInt.format(Math.round(r.today))} €`}
            />
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// ── 2 · Línea · tendencia (serie diaria de ticket medio de getSalesKpis) ─────────────────────────
export function MiniTrendLine({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const path = linePath(q.data?.series?.avgTicket ?? []);

  return (
    <PanelShell id="mini-tendencia" bare>
      <div className="mw-card">
        <div className="mw-label">Línea · tendencia</div>
        <svg className="mw-svg" viewBox="0 0 240 80" aria-hidden="true">
          {path ? (
            <>
              <path
                d={path.line}
                fill="none"
                stroke="var(--ui-brand)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={path.lastX} cy={path.lastY} r="3.5" fill="var(--ui-brand)" />
            </>
          ) : null}
        </svg>
      </div>
    </PanelShell>
  );
}

// ── 3 · Área · acumulado ─────────────────────────────────────────────────────────────────────────
// Reescrito de cero copiando el markup EXACTO del handoff (sección 08 «Mini gráficas»): área a sangre con
// degradado vertical del acento (.2 → 0), baseline al pie (y=80) y trazo de 2.5px no escalado con punta
// redonda. La serie es la suma ACUMULADA del beneficio diario (getMarginKpis.realMarginSeries); los puntos
// se reparten uniformemente en el viewBox 240×80 y se normalizan a y∈[70,8] (igual que el handoff: arranca
// abajo-izquierda y sube a arriba-derecha). Cálculo propio del trazado, sin el helper de la línea.
export function MiniCumulativeArea({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });

  // Suma acumulada del beneficio diario → curva monótona creciente.
  let acc = 0;
  const cumulative = (q.data?.realMarginSeries ?? []).filter(ok).map((v) => (acc += v));

  // Trazado al estilo del handoff: viewBox 240×80, la línea va de y=70 (abajo-izq) a y=8 (arriba-der).
  const X = 240;
  const Y_BASE = 70;
  const Y_TOP = 8;
  const min = Math.min(...cumulative);
  const max = Math.max(...cumulative);
  const span = max - min || 1;
  const points = cumulative.map((v, i) => {
    const x = (i / (cumulative.length - 1)) * X;
    const y = Y_BASE - ((v - min) / span) * (Y_BASE - Y_TOP);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.length >= 2 ? `M${points.join(' L')}` : '';

  return (
    <PanelShell id="mini-acumulado" bare>
      <div className="mw-card">
        <div className="mw-label">Área · acumulado</div>
        <svg className="mw-svg" viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
          {line ? (
            <>
              <defs>
                <linearGradient id="mw-acc-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--ui-brand)" stopOpacity="0.2" />
                  <stop offset="1" stopColor="var(--ui-brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Relleno: línea + cierre al pie (baseline y=80). */}
              <path d={`${line} L${X},80 L0,80 Z`} fill="url(#mw-acc-grad)" />
              {/* Trazo del acento. */}
              <path
                d={line}
                fill="none"
                stroke="var(--ui-brand)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            </>
          ) : null}
        </svg>
      </div>
    </PanelShell>
  );
}

// ── 4 · Donut · mix (reparto por familia; nº de familias al centro del rótulo) ───────────────────
export function MiniFamilyDonut({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const data = [...(q.data ?? [])].sort((a, b) => b.total - a.total);
  const total = data.reduce((s, f) => s + Math.max(0, f.total), 0) || 1;
  const R = 26;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segs = data.slice(0, 5).map((f, i) => {
    const len = (Math.max(0, f.total) / total) * C;
    const seg = { len, offset: -acc, t: 1 - i * 0.21 };
    acc += len;
    return seg;
  });

  return (
    <PanelShell id="mini-donut" bare>
      <div className="mw-card mw-card--row">
        <div>
          <div className="mw-label mw-label--bare">Donut · mix</div>
          <div className="mw-donut-value">{data.length} fam.</div>
        </div>
        <svg className="mw-donut-ring" viewBox="0 0 64 64" aria-hidden="true">
          <g transform="rotate(-90 32 32)" fill="none" strokeWidth="9">
            {segs.map((s, i) => (
              <circle
                key={i}
                cx="32"
                cy="32"
                r={R}
                stroke={rampFill(s.t)}
                strokeDasharray={`${s.len.toFixed(1)} ${(C - s.len).toFixed(1)}`}
                strokeDashoffset={s.offset.toFixed(1)}
              />
            ))}
          </g>
        </svg>
      </div>
    </PanelShell>
  );
}

// ── 5 · Gauge · margen (semicírculo de capacidad = % de margen real de getMarginKpis) ────────────
export function MiniMarginGauge({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const pct = ok(q.data?.marginPct) ? clamp01(q.data!.marginPct) : null;
  const ARC = 157; // longitud del semicírculo r=50 (π·50)
  const fill = pct == null ? 0 : pct * ARC;

  return (
    <PanelShell id="mini-gauge" bare>
      <div className="mw-card">
        <div className="mw-label mw-label--bare">Gauge · margen</div>
        <div className="mw-gauge">
          <svg viewBox="0 0 120 66" aria-hidden="true">
            <path
              d="M10,62 A50,50 0 0 1 110,62"
              fill="none"
              stroke="var(--ui-surface-subtle)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              d="M10,62 A50,50 0 0 1 110,62"
              fill="none"
              stroke="var(--ui-brand)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${fill.toFixed(1)} ${ARC}`}
            />
          </svg>
          <div className="mw-gauge-value">{pct == null ? '—' : `${nf1.format(pct * 100)}%`}</div>
        </div>
      </div>
    </PanelShell>
  );
}

// ── 6 · Top familias (riel proporcional de las 3 primeras familias) ──────────────────────────────
export function MiniTopFamilies({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const data = [...(q.data ?? [])].sort((a, b) => b.total - a.total).slice(0, 3);
  const max = Math.max(1, ...data.map((f) => f.total));

  return (
    <PanelShell id="mini-familias" bare>
      <div className="mw-card">
        <div className="mw-label mw-label--mb13">Top familias</div>
        <div className="mw-fam">
          {data.map((f) => (
            <div className="mw-fam-row" key={f.familyId ?? f.familyName}>
              <span className="mw-fam-name">{f.familyName}</span>
              <span className="mw-fam-track">
                <span
                  className="mw-fam-fill"
                  style={{ width: `${Math.max(4, (f.total / max) * 100)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// Horas de comercio del handoff (7h→17h): 11 franjas fijas. Mapea la facturación de cada hora.
const SHOP_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function useHourRevenue(store: PanelProps['store']): number[] {
  const day = todayLocalIso();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });
  const byHour = new Map((q.data ?? []).map((h) => [h.hour, h.revenue]));
  return SHOP_HOURS.map((h) => byHour.get(h) ?? 0);
}

// ── 7 · Heatmap · horas (tira de 11 celdas, intensidad por facturación; horas 7→17) ──────────────
export function MiniHourHeatmap({ store }: PanelProps): ReactElement {
  const revs = useHourRevenue(store);
  const max = Math.max(1, ...revs);

  return (
    <PanelShell id="mini-heatmap" bare>
      <div className="mw-card">
        <div className="mw-label">Heatmap · horas</div>
        <div className="mw-heat">
          {revs.map((r, i) => (
            <span key={SHOP_HOURS[i]} style={{ background: rampFill(r / max) }} />
          ))}
        </div>
        <div className="mw-heat-foot">
          <span>7h</span>
          <span>17h</span>
        </div>
      </div>
    </PanelShell>
  );
}

// ── 8 · Columnas · hora (columnas por hora; la hora punta en acento; horas 7→17) ─────────────────
export function MiniHourColumns({ store }: PanelProps): ReactElement {
  const revs = useHourRevenue(store);
  const max = Math.max(1, ...revs);
  const peak = revs.indexOf(Math.max(...revs));

  return (
    <PanelShell id="mini-columnas" bare>
      <div className="mw-card">
        <div className="mw-label">Columnas · hora</div>
        <div className="mw-cols">
          {revs.map((r, i) => (
            <span
              key={SHOP_HOURS[i]}
              className={i === peak && max > 1 ? 'is-peak' : undefined}
              style={{ height: `${Math.max(4, (r / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </PanelShell>
  );
}
