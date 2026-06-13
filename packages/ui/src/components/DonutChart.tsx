import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface DonutSlice {
  /** Nombre de la categoría (también la key de selección). */
  label: string;
  /** Valor de la porción; los negativos se tratan como 0. */
  value: number;
  /** Color del segmento; por defecto, paleta categórica `--ui-cat-n` por orden. */
  color?: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  /** Lado del lienzo cuadrado en px. Por defecto 168. */
  size?: number;
  /** Grosor del anillo en px. Por defecto 22. */
  thickness?: number;
  /** Formatea valores para el centro y la leyenda. Por defecto, `String`. */
  formatValue?: (value: number) => string;
  /** Etiqueta sobre el valor central (en reposo). Por defecto "Total". */
  centerLabel?: string;
  /** Valor central en reposo; por defecto, la suma formateada. */
  centerValue?: string;
  /** Muestra la leyenda lateral. Por defecto, true. */
  legend?: boolean;
  /** Si se aporta, cada fila de la leyenda es un `<button>` que emite su `label`. */
  onSelect?: (label: string) => void;
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

const GAP_PCT = 1.2; // separación entre porciones (en unidades de pathLength=100)

// Anillo de composición (donut) con total al centro y leyenda. Segmentos en
// stroke-dash sobre pathLength=100, así el cálculo es porcentual y nítido. Al
// pasar/enfocar una porción o su fila, el resto se atenúa y el centro muestra
// esa categoría. La leyenda es texto real (capa accesible); el SVG es decorativo.
export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  formatValue,
  centerLabel = 'Total',
  centerValue,
  legend = true,
  onSelect,
  ariaLabel,
  className,
  'data-testid': testid,
}: DonutChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const [hovered, setHovered] = React.useState<number | null>(null);

  const slices = data.map((d) => ({ ...d, value: Math.max(0, d.value) }));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const colorOf = (d: DonutSlice, i: number): string => d.color ?? PALETTE[i % PALETTE.length]!;

  // Centro: en hover, la categoría señalada; en reposo, el total (o el override).
  const active = hovered != null ? slices[hovered] : null;
  const centerTop = active ? active.label : centerLabel;
  const centerMain = active != null ? fmt(active.value) : (centerValue ?? fmt(total));

  // Offset acumulado para encadenar las porciones a lo largo del anillo.
  let acc = 0;

  return (
    <div
      className={cn('ui-donut', hovered != null && 'has-hover', className)}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-donut-ring" style={{ width: size, height: size }}>
        <svg
          className="ui-donut-svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            className="ui-donut-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={thickness}
          />
          {total > 0 &&
            slices.map((d, i) => {
              const pct = (d.value / total) * 100;
              const gap = slices.length > 1 ? GAP_PCT : 0;
              const dash = Math.max(pct - gap, 0.001);
              const offset = -acc;
              acc += pct;
              if (d.value === 0) return null;
              return (
                <circle
                  key={d.label}
                  className={cn('ui-donut-seg', hovered === i && 'is-active')}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={colorOf(d, i)}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  pathLength={100}
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={offset}
                  data-testid="ui-donut-seg"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
                />
              );
            })}
        </svg>
        <div className="ui-donut-center">
          <span className="ui-donut-center-label">{centerTop}</span>
          <span className="ui-donut-center-value">{centerMain}</span>
        </div>
      </div>

      {legend &&
        (slices.length === 0 || total === 0 ? (
          <p className="ui-donut-empty">Sin datos en el periodo.</p>
        ) : (
          <ul className="ui-donut-legend">
            {slices.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              const pctText = `${pct.toFixed(pct >= 10 ? 0 : 1)} %`;
              const content = (
                <>
                  <span
                    className="ui-donut-swatch"
                    style={{ background: colorOf(d, i) }}
                    aria-hidden="true"
                  />
                  <span className="ui-donut-legend-name">{d.label}</span>
                  <span className="ui-donut-legend-value">{fmt(d.value)}</span>
                  <span className="ui-donut-legend-pct">{pctText}</span>
                </>
              );
              const shared = {
                className: cn('ui-donut-legend-item', hovered === i && 'is-active'),
                onMouseEnter: () => setHovered(i),
                onMouseLeave: () => setHovered((v) => (v === i ? null : v)),
                onFocus: () => setHovered(i),
                onBlur: () => setHovered((v) => (v === i ? null : v)),
              };
              return onSelect ? (
                <li key={d.label}>
                  <button type="button" {...shared} onClick={() => onSelect(d.label)}>
                    {content}
                  </button>
                </li>
              ) : (
                <li key={d.label} {...shared}>
                  {content}
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
