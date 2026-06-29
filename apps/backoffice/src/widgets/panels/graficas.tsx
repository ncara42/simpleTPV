import './hour-area.css';
import './store-bars.css';
import './heatmap.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getSalesByHourOnDay, getSalesToday, type SalesByHour } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';
import { useBounceScroll } from './use-bounce-scroll.js';

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
  const stripRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [tipStyle, setTipStyle] = useState<{ left: string; top: string }>({
    left: '0px',
    top: '0px',
  });
  const [tipBelow, setTipBelow] = useState(true);

  const rows = q.data ?? [];
  const byHour = new Map<number, SalesByHour>(rows.map((h) => [h.hour, h]));
  const maxRev = Math.max(0, ...rows.map((h) => h.revenue));
  const peakHour: number | null =
    maxRev > 0 ? rows.reduce((b, h) => (h.revenue > b.revenue ? h : b)).hour : null;

  // Al montar (y al llegar datos) deja 07–17 a la vista; el resto queda desplazable. El carril, su
  // barra de scroll y el rebote elástico los gobierna el hook compartido `useBounceScroll`.
  useEffect(() => {
    const el = scrollRef.current;
    const st = startRef.current;
    if (el && st) el.scrollLeft = Math.max(0, st.offsetLeft - 18);
  }, [rows.length]);
  useBounceScroll(scrollRef, stripRef, trackRef, thumbRef, rows.length);

  const handleCellEnter = (e: { currentTarget: HTMLDivElement }, h: number): void => {
    setHoveredHour(h);
    const r = e.currentTarget.getBoundingClientRect();
    const tipH = tipRef.current?.offsetHeight ?? 44;
    const vx = r.left + r.width / 2;
    const vy = r.top;
    const panelBottom = panelRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
    setTipBelow(vy + TIP_GAP + tipH <= panelBottom);
    setTipStyle({ left: `${vx}px`, top: `${vy}px` });
  };
  const clearHover = (): void => setHoveredHour(null);
  const hoveredData = hoveredHour !== null ? byHour.get(hoveredHour) : undefined;

  return (
    <PanelShell id="graf-heatmap" bare>
      <div className="hm-panel" ref={panelRef}>
        <div className="hm-head">
          <h3 className="hm-title">Mapa de calor horario</h3>
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
          onMouseLeave={clearHover}
        >
          {/* La tira interior es la que se traslada para el efecto de rebote (rubber-band) al
              sobrepasar los extremos; el scroll vive en el contenedor `.hm-scroll`. */}
          <div className="hm-strip" ref={stripRef}>
            {HM_HOURS.map((h) => {
              const row = byHour.get(h);
              const rev = row?.revenue ?? 0;
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
                  onMouseEnter={(e) => handleCellEnter(e, h)}
                >
                  {hh2(h)}
                </div>
              );
            })}
          </div>
        </div>
        <div className="hm-track" ref={trackRef} aria-hidden="true">
          <div className="hm-thumb" ref={thumbRef} />
        </div>
        {hoveredHour !== null &&
          createPortal(
            <div
              ref={tipRef}
              className={`ha-tip${tipBelow ? '' : ' ha-tip--above'}`}
              style={tipStyle}
            >
              <b>{`${hh2(hoveredHour)}:00 · ${EUR0.format(hoveredData?.revenue ?? 0)}`}</b>
              <span>{`${hoveredData?.count ?? 0} ticket${(hoveredData?.count ?? 0) !== 1 ? 's' : ''}`}</span>
            </div>,
            document.body,
          )}
      </div>
    </PanelShell>
  );
}

// ── Sección 02 · «Distribución horaria» (área a sangre) ──
const EUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

// viewBox achatado (1100×120): la pista es ANCHA (24 horas legibles → desborda y se desplaza, como el
// heatmap) pero BAJA, para que el alto renderizado siga compacto (≈ min-width·VB_H/VB_W ≈ 142px con
// min-width 1300). Al quitar el caption y el conmutador, el gráfico ocupa ese hueco (líneas más altas)
// y el card mantiene su alto. La base coincide con el fondo del SVG (Y_BASE=VB_H) para que las
// etiquetas de hora queden centradas entre ese divisor y la barra de scroll. Y_TOP=8 da aire arriba.
const VB_W = 1100;
const VB_H = 118;
const Y_BASE = 118;
const Y_TOP = 8;
const HEADROOM = 1.06;
const TIP_GAP = 10; // hueco punto↔tooltip (coincide con el offset del transform en CSS)
const TIP_EST_H = 44; // alto estimado del tooltip antes de poder medirlo (2 líneas)

export function HourArea({ store }: PanelProps): ReactElement {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tipStyle, setTipStyle] = useState<{ left: string; top: string }>({
    left: '0px',
    top: '0px',
  });
  // El tooltip se coloca normalmente DEBAJO del punto; si no cabe (punto bajo, cerca del fondo
  // del card), se voltea ARRIBA para no quedar recortado por el `overflow: hidden` del panel.
  const [tipBelow, setTipBelow] = useState(true);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
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
  // El eje cubre SIEMPRE las 24 horas (00–23). La API devuelve sólo las horas con actividad,
  // así que rellenamos los huecos a cero para que la curva refleje el día completo y real.
  const byHour = new Map<number, SalesByHour>(all.map((h) => [h.hour, h]));
  const points: SalesByHour[] = Array.from(
    { length: 24 },
    (_, h) => byHour.get(h) ?? { hour: h, count: 0, revenue: 0 },
  );

  const n = points.length;
  const maxRev = Math.max(1, ...points.map((p) => p.revenue));
  const topScale = maxRev * HEADROOM;
  const xAt = (i: number): number => (n > 1 ? (i * VB_W) / (n - 1) : VB_W / 2);
  const yAt = (rev: number): number => Y_BASE - (rev / topScale) * (Y_BASE - Y_TOP);
  const peakIdx = points.reduce(
    (b, p, i) => (p.revenue > (points[b]?.revenue ?? -Infinity) ? i : b),
    0,
  );

  const coords = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.revenue).toFixed(1)}`);
  const linePath = `M${coords.join(' L')}`;
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${Y_BASE} L${xAt(0).toFixed(1)},${Y_BASE} Z`;
  const grids = [Y_TOP, Y_TOP + (Y_BASE - Y_TOP) / 3, Y_TOP + (2 * (Y_BASE - Y_TOP)) / 3];

  // Carril + barra de scroll + rebote elástico, idéntico al heatmap (hook compartido). `hasData`: el
  // carril sólo existe con datos → el hook re-engancha sus listeners cuando aparece.
  useBounceScroll(scrollRef, stripRef, trackRef, thumbRef, hasData);

  // Al llegar los datos deja la FRANJA ACTIVA a la vista (como el heatmap, que arranca en 07): así no
  // se abre mostrando horas vacías de madrugada. xAt(i)/VB_W = i/(n-1) → fracción del ancho desplazable.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasData) return;
    const target = Math.max(0, firstH - 1);
    el.scrollLeft = (target / (n - 1)) * el.scrollWidth - 12;
  }, [hasData, firstH, n]);

  // Un único handler en el SVG detecta el punto más cercano por X → guía vertical + tooltip bajo el punto.
  const handleSvgMove = (e: { currentTarget: Element; clientX: number; clientY: number }): void => {
    if (n === 0) return;
    const bbox = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - bbox.left) / bbox.width) * VB_W;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - svgX);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    setHoveredIdx(nearest);
    const wrap = chartWrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    // Tooltip en PORTAL (position: fixed) → coordenadas de VIEWPORT, sin recorte de ningún ancestro.
    // Se ancla al PUNTO (no al cursor) y se centra sobre la guía vertical con translate(-50%) en CSS.
    // bbox.left/top ya incorporan el scroll horizontal → sigue al punto visible aunque pueda sobresalir.
    const hp = points[nearest];
    const vx = bbox.left + (xAt(nearest) / VB_W) * bbox.width;
    const vy = bbox.top + ((hp ? yAt(hp.revenue) : Y_BASE) / VB_H) * bbox.height;
    // ¿Cabe debajo del punto dentro del card? Si no, se voltea arriba (la guía/espacio del propio card).
    const tipH = tipRef.current?.offsetHeight ?? TIP_EST_H;
    setTipBelow(vy + TIP_GAP + tipH <= r.bottom);
    setTipStyle({ left: `${vx}px`, top: `${vy}px` });
  };
  const clearHover = (): void => setHoveredIdx(null);
  const hoveredPoint = hoveredIdx !== null ? (points[hoveredIdx] ?? null) : null;

  return (
    <PanelShell id="graf-hour-area" bare>
      <div className="ha-panel">
        <div className="ha-head">
          <h3 className="ha-title">Distribución horaria</h3>
        </div>
        {hasData ? (
          <div className="ha-chart-wrap" ref={chartWrapRef}>
            <div className="ha-scroll" ref={scrollRef}>
              {/* Tira interior (SVG + eje): objetivo del rebote (se traslada con transform). */}
              <div className="ha-strip" ref={stripRef}>
                <svg
                  className="ha-svg"
                  viewBox={`0 0 ${VB_W} ${VB_H}`}
                  role="img"
                  aria-label="Facturación por franja horaria"
                  style={{ cursor: 'crosshair' }}
                  onMouseMove={handleSvgMove}
                  onMouseLeave={clearHover}
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
                  {hoveredIdx !== null ? (
                    <line
                      x1={xAt(hoveredIdx)}
                      y1={Y_TOP - 8}
                      x2={xAt(hoveredIdx)}
                      y2={Y_BASE}
                      stroke="var(--ui-brand)"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      opacity="0.4"
                    />
                  ) : null}
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
                        r={hoveredIdx === i ? '4.75' : '3.5'}
                        fill={hoveredIdx === i ? 'var(--ui-brand)' : 'var(--ui-surface)'}
                        stroke="var(--ui-brand)"
                        strokeWidth="2"
                      />
                    ),
                  )}
                </svg>
                {/* Las 24 horas a tamaño legible. Cada etiqueta se posiciona en la X EXACTA de su punto
                    (i/(n-1)) y se centra con translateX → queda alineada con el dato, no repartida. */}
                <div className="ha-axis">
                  {points.map((p, i) => (
                    <span key={p.hour} style={{ left: `${(i / (n - 1)) * 100}%` }}>
                      {hh2(p.hour)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="ha-track" ref={trackRef} aria-hidden="true">
              <div className="ha-thumb" ref={thumbRef} />
            </div>
            {/* Portal a <body>: la posición es de viewport (fixed) y así el tooltip puede sobresalir
                del card en los extremos sin que lo recorte el `overflow:hidden` del panel. */}
            {hoveredPoint !== null &&
              createPortal(
                <div
                  ref={tipRef}
                  className={`ha-tip${tipBelow ? '' : ' ha-tip--above'}`}
                  style={tipStyle}
                >
                  <b>{`${hh2(hoveredPoint.hour)}:00 · ${EUR0.format(hoveredPoint.revenue)}`}</b>
                  <span>{`${hoveredPoint.count} ticket${hoveredPoint.count !== 1 ? 's' : ''}`}</span>
                </div>,
                document.body,
              )}
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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tipStyle, setTipStyle] = useState<{ left: string; top: string }>({
    left: '0px',
    top: '0px',
  });
  const [tipBelow, setTipBelow] = useState(true);
  const tipRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ['dash-comparison', 'month', undefined],
    queryFn: () => getSalesToday(undefined, 'month'),
    placeholderData: keepPreviousData,
  });
  const stores = [...(q.data?.byStore ?? [])]
    .sort((a, b) => b.today - a.today)
    .slice(0, STORE_BARS_MAX);
  const maxRev = Math.max(1, ...stores.map((s) => s.today));

  useBounceScroll(scrollRef, stripRef, trackRef, thumbRef, stores.length);

  const handleColEnter = (e: { currentTarget: HTMLDivElement }, idx: number): void => {
    setHoveredIdx(idx);
    const bar = e.currentTarget.querySelector<HTMLElement>('.sb-bar');
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const tipH = tipRef.current?.offsetHeight ?? 36;
    const vx = r.left + r.width / 2;
    const vy = r.top;
    const panelBottom = panelRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
    setTipBelow(vy + TIP_GAP + tipH <= panelBottom);
    setTipStyle({ left: `${vx}px`, top: `${vy}px` });
  };
  const clearHover = (): void => setHoveredIdx(null);
  const hoveredStore = hoveredIdx !== null ? (stores[hoveredIdx] ?? null) : null;

  return (
    <PanelShell id="graf-store-bars" fill bare>
      <div className="sb-panel" ref={panelRef}>
        <h3 className="sb-title">Ventas por tienda</h3>
        {stores.length > 0 ? (
          <>
            <div
              className="sb-scroll"
              ref={scrollRef}
              role="img"
              aria-label="Facturación por tienda (este mes)"
            >
              <div
                className="sb-strip"
                ref={stripRef}
                style={{ minWidth: `${stores.length * 30 + (stores.length - 1) * 14 + 40}px` }}
              >
                <div className="sb-bars">
                  {stores.map((s, i) => (
                    <div
                      className="sb-col"
                      key={s.storeId}
                      onMouseEnter={(e) => handleColEnter(e, i)}
                      onMouseLeave={clearHover}
                    >
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
              </div>
            </div>
            <div className="sb-track" ref={trackRef} aria-hidden="true">
              <div className="sb-thumb" ref={thumbRef} />
            </div>
          </>
        ) : (
          <div className="sb-empty">{q.isLoading ? 'Cargando…' : 'Sin ventas en el periodo'}</div>
        )}
        {hoveredStore !== null &&
          createPortal(
            <div
              ref={tipRef}
              className={`ha-tip${tipBelow ? '' : ' ha-tip--above'}`}
              style={tipStyle}
            >
              <b>{EUR0.format(hoveredStore.today)}</b>
            </div>,
            document.body,
          )}
      </div>
    </PanelShell>
  );
}
