import './hour-area.css';

import { HeatStrip } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';

import { getSalesByHourOnDay, type SalesByHour } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Día de hoy (local) como 'YYYY-MM-DD' — mismo criterio que el selector de día de «Ventas por hora».
function todayLocalIso(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// Sección 02 · Mapa de calor horario — una celda por hora con ventas; intensidad por facturación.
// Lectura instantánea de la hora punta del día (la celda más saturada = el máximo, marcada con anillo).
// Comparte el `queryKey` 'dash-hour' con el widget clásico de hora → caché compartida.
export function HourHeatmap({ store }: PanelProps): ReactElement {
  const day = todayLocalIso();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });
  const cells = (q.data ?? []).map((h: SalesByHour) => ({ label: `${h.hour}`, value: h.revenue }));

  return (
    <PanelShell id="graf-heatmap" fill>
      <HeatStrip items={cells} isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

// ── Sección 02 · «Distribución horaria» (área a sangre) — réplica pixel-a-pixel del handoff ──
const EUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const hh2 = (h: number): string => String(h).padStart(2, '0');

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
