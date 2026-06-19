import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface PieSlice {
  /** Etiqueta de la porción (leyenda, tooltip, aria). */
  label: string;
  /** Valor (no negativo); define el ángulo de la porción. */
  value: number;
  /** Color de la porción; por defecto, paleta categórica `--ui-cat-n` por orden. */
  color?: string;
}

export interface PieChartProps {
  data: PieSlice[];
  /** Anillo (donut) en vez de tarta sólida. Por defecto, false. */
  donut?: boolean;
  /** Alto del lienzo en px (el SVG es cuadrado). Por defecto, 220. */
  height?: number;
  /** Formatea valores en tooltip/leyenda. Por defecto, `String`. */
  formatValue?: (value: number) => string;
  /** Muestra la leyenda de porciones con su % y valor. Por defecto, true. */
  legend?: boolean;
  /** Etiqueta accesible del conjunto. */
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

const PALETTE = [
  'var(--ui-cat-1)',
  'var(--ui-cat-2)',
  'var(--ui-cat-3)',
  'var(--ui-cat-4)',
  'var(--ui-cat-5)',
  'var(--ui-cat-6)',
  'var(--ui-cat-7)',
  'var(--ui-cat-8)',
];

// Geometría sobre un viewBox 0..100: centro (50,50), radio exterior 48.
const CX = 50;
const CY = 50;
const R_OUTER = 48;
const R_INNER = 28; // solo donut

// Punto del borde a un ángulo (grados, 0 = arriba, horario).
function polar(r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// Path de una porción de tarta (rInner = 0) o de anillo (rInner > 0).
function slicePath(start: number, end: number, rInner: number): string {
  const large = end - start > 180 ? 1 : 0;
  const [oxs, oys] = polar(R_OUTER, start);
  const [oxe, oye] = polar(R_OUTER, end);
  if (rInner <= 0) {
    return `M ${CX} ${CY} L ${oxs} ${oys} A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${oxe} ${oye} Z`;
  }
  const [ixe, iye] = polar(rInner, end);
  const [ixs, iys] = polar(rInner, start);
  return [
    `M ${oxs} ${oys}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${oxe} ${oye}`,
    `L ${ixe} ${iye}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${ixs} ${iys}`,
    'Z',
  ].join(' ');
}

// Tarta/donut con porciones SVG nativas (sin deps externas). Hover/focus resalta la
// porción y muestra un tooltip con etiqueta, valor y porcentaje. La leyenda es texto
// real (accesible). Coherente con el estilo de <Chart>/<StackedBarChart>.
export function PieChart({
  data,
  donut = false,
  height = 220,
  formatValue,
  legend = true,
  ariaLabel,
  className,
  'data-testid': testid,
}: PieChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const [active, setActive] = React.useState<number | null>(null);

  const slices = data.filter((s) => s.value > 0);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const rInner = donut ? R_INNER : 0;
  const colorOf = (slice: PieSlice, i: number): string =>
    slice.color ?? PALETTE[i % PALETTE.length]!;

  // Ángulos acumulados por porción.
  let acc = 0;
  const arcs = slices.map((slice, i) => {
    const start = (acc / total) * 360;
    acc += slice.value;
    const end = (acc / total) * 360;
    const pct = total > 0 ? slice.value / total : 0;
    return { slice, i, start, end, pct };
  });

  // Caso de una sola porción (100 %): un arco completo (start==end) no dibuja nada;
  // se usa un círculo (o anillo) entero.
  const single = arcs.length === 1;

  return (
    <div
      className={cn('ui-pie', donut && 'ui-pie-donut', className)}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-pie-canvas">
        <svg viewBox="0 0 100 100" className="ui-pie-svg" aria-hidden="true">
          {total === 0 ? (
            <circle cx={CX} cy={CY} r={R_OUTER} className="ui-pie-empty" />
          ) : single ? (
            <>
              <circle cx={CX} cy={CY} r={R_OUTER} fill={colorOf(arcs[0]!.slice, 0)} />
              {donut && <circle cx={CX} cy={CY} r={rInner} className="ui-pie-hole" />}
            </>
          ) : (
            arcs.map(({ slice, i, start, end }) => (
              <path
                key={slice.label}
                d={slicePath(start, end, rInner)}
                fill={colorOf(slice, i)}
                className={cn('ui-pie-slice', active === i && 'is-active')}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((v) => (v === i ? null : v))}
                data-testid="ui-pie-slice"
              />
            ))
          )}
        </svg>
        {active != null && arcs[active] && (
          <div className="ui-pie-tip" aria-hidden="true">
            <span className="ui-pie-tip-title">{arcs[active]!.slice.label}</span>
            <span className="ui-pie-tip-value">
              {fmt(arcs[active]!.slice.value)} · {(arcs[active]!.pct * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      {legend && (
        <ul className="ui-pie-legend">
          {arcs.map(({ slice, i, pct }) => (
            <li key={slice.label} className="ui-pie-legend-item">
              <span className="ui-pie-legend-dot" style={{ background: colorOf(slice, i) }} />
              <span className="ui-pie-legend-label" title={slice.label}>
                {slice.label}
              </span>
              <span className="ui-pie-legend-value">
                {fmt(slice.value)} · {(pct * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
