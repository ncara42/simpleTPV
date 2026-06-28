import './hour-area.css';
import './store-bars.css';
import './heatmap.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import { getSalesByHourOnDay, getSalesToday, type SalesByHour } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Día de hoy (local) como 'YYYY-MM-DD' — mismo criterio que el selector de día de «Ventas por hora».
function todayLocalIso(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// Sección 02 · «Mapa de calor horario» (réplica pixel-a-pixel del handoff). Una celda cuadrada por hora;
// la intensidad del azul = facturación de la franja, el pico con anillo. Muestra las 24 h: por defecto
// se ven 07–17 y el resto se desplaza horizontalmente. Comparte el queryKey 'dash-hour' → caché común.
const HM_HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);
const HM_DEFAULT_START = 7; // primera hora visible al montar (07–17 a la vista)
const HM_INK = '#0d3a73'; // texto sobre celdas claras (azul tinta del handoff)
const hmRamp = (t: number): string =>
  `color-mix(in oklab, var(--ui-brand) ${Math.round(8 + Math.max(0, Math.min(1, t)) * 92)}%, var(--ui-surface))`;
const hh2 = (h: number): string => String(h).padStart(2, '0');

export function HourHeatmap({ store }: PanelProps): ReactElement {
  const day = todayLocalIso();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);

  const rows = q.data ?? [];
  const byHour = new Map<number, SalesByHour>(rows.map((h) => [h.hour, h]));
  const maxRev = Math.max(0, ...rows.map((h) => h.revenue));
  const peakHour: number | null =
    maxRev > 0 ? rows.reduce((b, h) => (h.revenue > b.revenue ? h : b)).hour : null;

  // Al montar (y al llegar datos) deja 07–17 a la vista; el resto queda desplazable.
  useEffect(() => {
    const sc = scrollRef.current;
    const st = startRef.current;
    if (sc && st) sc.scrollLeft = Math.max(0, st.offsetLeft - 16);
  }, [rows.length]);

  return (
    <PanelShell id="graf-heatmap" bare>
      <div className="hm-panel">
        <div className="hm-head">
          <div>
            <h3 className="hm-title">
              Mapa de calor horario<span className="hm-badge">ALT</span>
            </h3>
            <p className="hm-sub">
              Intensidad de ventas por hora — lectura instantánea de los picos
            </p>
          </div>
          <div className="hm-legend">
            Menos
            <span className="hm-legend-swatches" aria-hidden="true">
              <span style={{ background: hmRamp(0.05) }} />
              <span style={{ background: hmRamp(0.35) }} />
              <span style={{ background: hmRamp(0.65) }} />
              <span style={{ background: hmRamp(1) }} />
            </span>
            Más
          </div>
        </div>
        <div
          className="hm-scroll"
          ref={scrollRef}
          role="img"
          aria-label="Intensidad de ventas por hora (24 horas, 07–17 a la vista)"
        >
          {HM_HOURS.map((h) => {
            const rev = byHour.get(h)?.revenue ?? 0;
            const t = maxRev > 0 ? rev / maxRev : 0;
            return (
              <div
                key={h}
                ref={h === HM_DEFAULT_START ? startRef : undefined}
                className={`hm-cell${peakHour === h ? ' hm-cell--peak' : ''}`}
                style={{
                  background: hmRamp(t),
                  color: t >= 0.55 ? 'var(--ui-chart-tip-fg)' : HM_INK,
                }}
              >
                {hh2(h)}
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
}

// ── Sección 02 · «Distribución horaria» (área a sangre) — réplica pixel-a-pixel del handoff ──
const EUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

// Geometría del viewBox del handoff (1100×240, base en y=210, techo de escala en y=20).
const VB_W = 1100;
const VB_H = 240;
const Y_BASE = 210;
const Y_TOP = 20;
const HEADROOM = 1.06; // el pico queda un 6% por debajo del techo, como en el handoff

// Serie de facturación por franja horaria del día. El pico se marca con punto relleno + tooltip oscuro;
// «franja activa» = de la primera a la última hora con actividad. Conmutador línea/barras.
export function HourArea({ store }: PanelProps): ReactElement {
  const [view, setView] = useState<'line' | 'bar'>('line');
  const day = todayLocalIso();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });

  const all = q.data ?? [];
  const active = all.filter((h) => h.revenue > 0 || h.count > 0);
  const hasData = active.length > 0;
  const firstH = hasData ? Math.min(...active.map((h) => h.hour)) : 0;
  const lastH = hasData ? Math.max(...active.map((h) => h.hour)) : 0;
  // Banda contigua de la primera a la última hora activa (rellena huecos para una línea continua).
  const points = all
    .filter((h) => h.hour >= firstH && h.hour <= lastH)
    .sort((a, b) => a.hour - b.hour);

  const n = points.length;
  const maxRev = Math.max(1, ...points.map((p) => p.revenue));
  const topScale = maxRev * HEADROOM;
  const xAt = (i: number): number => (n > 1 ? (i * VB_W) / (n - 1) : VB_W / 2);
  const yAt = (rev: number): number => Y_BASE - (rev / topScale) * (Y_BASE - Y_TOP);
  const peakIdx = points.reduce(
    (b, p, i) => (p.revenue > (points[b]?.revenue ?? -Infinity) ? i : b),
    0,
  );
  const peak = points[peakIdx]; // SalesByHour | undefined (sin datos → undefined)

  const coords = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.revenue).toFixed(1)}`);
  const linePath = `M${coords.join(' L')}`;
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${Y_BASE} L${xAt(0).toFixed(1)},${Y_BASE} Z`;
  const grids = [Y_TOP, Y_TOP + (Y_BASE - Y_TOP) / 3, Y_TOP + (2 * (Y_BASE - Y_TOP)) / 3];

  return (
    <PanelShell id="graf-hour-area" bare>
      <div className="ha-panel">
        <div className="ha-head">
          <div>
            <h3 className="ha-title">Distribución horaria</h3>
            <p className="ha-sub">Facturación por franja horaria</p>
          </div>
          <div className="ha-toggle" role="group" aria-label="Tipo de gráfico">
            <button
              type="button"
              aria-label="Línea"
              aria-pressed={view === 'line'}
              onClick={() => setView('line')}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 3 3 5-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Barras"
              aria-pressed={view === 'bar'}
              onClick={() => setView('bar')}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="4" y="9" width="3.5" height="11" />
                <rect x="10.2" y="4" width="3.5" height="16" />
                <rect x="16.5" y="12" width="3.5" height="8" />
              </svg>
            </button>
          </div>
        </div>
        <div className="ha-kpis">
          <div>
            <div className="ha-kpi-label">Pico</div>
            <div className="ha-kpi-value">
              {peak ? EUR0.format(peak.revenue) : '—'}
              {peak ? <span> · {hh2(peak.hour)}:00</span> : null}
            </div>
          </div>
          <div>
            <div className="ha-kpi-label">Franja activa</div>
            <div className="ha-kpi-value">{hasData ? `${firstH} – ${lastH} h` : '—'}</div>
          </div>
        </div>
        {peak ? (
          <div className="ha-chart">
            <svg
              className="ha-svg"
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              role="img"
              aria-label="Facturación por franja horaria"
            >
              <defs>
                <linearGradient id="haGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--ui-brand)" stopOpacity="0.16" />
                  <stop offset="1" stopColor="var(--ui-brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {grids.map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2={VB_W}
                  y2={y}
                  stroke="var(--gst-150)"
                  strokeWidth="1"
                  strokeDasharray="2 5"
                />
              ))}
              <line
                x1="0"
                y1={Y_BASE}
                x2={VB_W}
                y2={Y_BASE}
                stroke="var(--ui-border-strong)"
                strokeWidth="1"
              />
              {view === 'line' ? (
                <>
                  <path d={areaPath} fill="url(#haGrad)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--ui-brand)"
                    strokeWidth="2.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {points.map((p, i) =>
                    i === peakIdx ? (
                      <circle
                        key={p.hour}
                        cx={xAt(i)}
                        cy={yAt(p.revenue)}
                        r="5"
                        fill="var(--ui-brand)"
                        stroke="var(--ui-surface)"
                        strokeWidth="2.5"
                      />
                    ) : (
                      <circle
                        key={p.hour}
                        cx={xAt(i)}
                        cy={yAt(p.revenue)}
                        r="3.5"
                        fill="var(--ui-surface)"
                        stroke="var(--ui-brand)"
                        strokeWidth="2"
                      />
                    ),
                  )}
                </>
              ) : (
                points.map((p, i) => {
                  const bw = (VB_W / n) * 0.46;
                  const x = Math.max(2, Math.min(VB_W - bw - 2, xAt(i) - bw / 2));
                  return (
                    <rect
                      key={p.hour}
                      x={x}
                      y={yAt(p.revenue)}
                      width={bw}
                      height={Y_BASE - yAt(p.revenue)}
                      rx="6"
                      fill="var(--ui-brand)"
                      opacity={i === peakIdx ? 1 : 0.82}
                    />
                  );
                })
              )}
            </svg>
            {view === 'line' ? (
              <div
                className="ha-tip"
                style={{
                  left: `${(xAt(peakIdx) / VB_W) * 100}%`,
                  top: `${(yAt(peak.revenue) / VB_H) * 100}%`,
                }}
              >
                <b>{`${hh2(peak.hour)}:00 · ${EUR0.format(peak.revenue)}`}</b>
                <span>{`${peak.count} tickets · pico del día`}</span>
              </div>
            ) : null}
            <div className="ha-axis">
              {points.map((p) => (
                <span key={p.hour}>{hh2(p.hour)}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="ha-empty">{q.isLoading ? 'Cargando…' : 'Sin ventas en el periodo'}</div>
        )}
      </div>
    </PanelShell>
  );
}

// ── Sección 02 · «Ventas por tienda» (barras) — réplica pixel-a-pixel del handoff ──
const STORE_BARS_MAX = 8; // tope de columnas para que no se aprieten
const PODIUM = 3; // nº de tiendas en acento; el resto en azul suave

// Facturación neta por tienda (del mes), de mayor a menor. Las 3 primeras en acento; valor encima de
// cada barra y nombre debajo. Reusa la query 'dash-comparison' (mes, todas las tiendas) → caché común.
function kEur(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : `${Math.round(v)}`;
}

export function StoreBars(_: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-comparison', 'month', undefined],
    queryFn: () => getSalesToday(undefined, 'month'),
    placeholderData: keepPreviousData,
  });
  const stores = [...(q.data?.byStore ?? [])]
    .sort((a, b) => b.today - a.today)
    .slice(0, STORE_BARS_MAX);
  const maxRev = Math.max(1, ...stores.map((s) => s.today));

  return (
    <PanelShell id="graf-store-bars" fill bare>
      <div className="sb-panel">
        <h3 className="sb-title">Ventas por tienda</h3>
        <p className="sb-sub">Facturación neta · este mes</p>
        {stores.length > 0 ? (
          <>
            <div className="sb-bars">
              {stores.map((s, i) => (
                <div className="sb-col" key={s.storeId}>
                  <span className="sb-val">{kEur(s.today)}</span>
                  <span
                    className={`sb-bar${i >= PODIUM ? ' sb-bar--soft' : ''}`}
                    style={{ height: `${(s.today / maxRev) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="sb-labels">
              {stores.map((s) => (
                <span className="sb-label" key={s.storeId}>
                  {s.storeName}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="sb-empty">{q.isLoading ? 'Cargando…' : 'Sin ventas en el periodo'}</div>
        )}
      </div>
    </PanelShell>
  );
}
