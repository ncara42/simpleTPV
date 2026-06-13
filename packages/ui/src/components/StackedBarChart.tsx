import * as React from 'react';

import { cn } from '../lib/cn.js';
import { niceTicks } from '../lib/curve.js';

export interface StackedSegment {
  /** Clave de la serie dentro de `StackedBarDatum.values`. */
  key: string;
  /** Nombre legible (leyenda y tooltip). */
  label: string;
  /** Color del tramo; por defecto, paleta categórica `--ui-cat-n` por orden. */
  color?: string;
}

export interface StackedBarDatum {
  /** Etiqueta de la columna. */
  label: string;
  /** Valor por serie (clave = `StackedSegment.key`); los ausentes cuentan como 0. */
  values: Record<string, number>;
}

export interface StackedBarChartProps {
  data: StackedBarDatum[];
  /** Series en orden de apilado (de abajo arriba) — define leyenda y colores. */
  segments: StackedSegment[];
  /** Alto del lienzo en px. Por defecto 248. */
  height?: number;
  /** Formatea valores en tooltip/aria. Por defecto, `String`. */
  formatValue?: (value: number) => string;
  /** Formatea las etiquetas del eje Y; por defecto usa `formatValue`. */
  formatAxis?: (value: number) => string;
  /** Rejilla + eje Y con pasos redondos. Por defecto, true. */
  showGrid?: boolean;
  /** Muestra la leyenda de series. Por defecto, true. */
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

const GRID_TICKS = 4;

// Barras apiladas: cada columna suma sus series (orden de `segments` = abajo→arriba).
// Comparte rejilla, eje y fila de etiquetas con <Chart>; el tooltip desglosa la
// columna por serie y muestra el total. La leyenda es texto real (accesible).
export function StackedBarChart({
  data,
  segments,
  height = 248,
  formatValue,
  formatAxis,
  showGrid = true,
  legend = true,
  ariaLabel,
  className,
  'data-testid': testid,
}: StackedBarChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const fmtAxis = (v: number): string => formatAxis?.(v) ?? fmt(v);
  const [tipFor, setTipFor] = React.useState<number | null>(null);

  const colorOf = (seg: StackedSegment, i: number): string =>
    seg.color ?? PALETTE[i % PALETTE.length]!;
  const totalOf = (d: StackedBarDatum): number =>
    segments.reduce((sum, s) => sum + Math.max(0, d.values[s.key] ?? 0), 0);

  const rawMax = Math.max(1, ...data.map(totalOf));
  const axis = showGrid ? niceTicks(rawMax, GRID_TICKS) : { top: rawMax, ticks: [] };
  const max = axis.top;

  return (
    <div className={cn('ui-stacked', className)}>
      <div
        className="ui-chart ui-chart-bars"
        style={{ height }}
        role={ariaLabel ? 'group' : undefined}
        aria-label={ariaLabel}
        data-testid={testid}
      >
        <div className="ui-chart-plot">
          {showGrid && (
            <div className="ui-chart-grid" aria-hidden="true">
              {axis.ticks.map((t) => (
                <div
                  key={t}
                  className="ui-chart-grid-line"
                  style={{ bottom: `${(t / max) * 100}%` }}
                >
                  {t > 0 && <span className="ui-chart-axis">{fmtAxis(t)}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="ui-chart-cols">
            {data.map((d, i) => {
              const total = totalOf(d);
              const stackPct = `${((total / max) * 100).toFixed(2)}%`;
              const tipEdge =
                i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
              const aria = `${d.label}: ${segments
                .map((s) => `${s.label} ${fmt(Math.max(0, d.values[s.key] ?? 0))}`)
                .join(' · ')} · Total ${fmt(total)}`;
              return (
                <div
                  key={d.label}
                  className="ui-chart-group"
                  tabIndex={0}
                  aria-label={aria}
                  style={{ '--i': i } as React.CSSProperties}
                  onMouseEnter={() => setTipFor(i)}
                  onMouseLeave={() => setTipFor((v) => (v === i ? null : v))}
                  onFocus={() => setTipFor(i)}
                  onBlur={() => setTipFor((v) => (v === i ? null : v))}
                  data-testid="ui-chart-group"
                >
                  <div className="ui-chart-pair">
                    <div className="ui-chart-stack" style={{ height: stackPct }}>
                      {segments.map((s, si) => {
                        const v = Math.max(0, d.values[s.key] ?? 0);
                        if (v === 0 || total === 0) return null;
                        return (
                          <div
                            key={s.key}
                            className="ui-chart-seg"
                            style={{
                              height: `${((v / total) * 100).toFixed(2)}%`,
                              background: colorOf(s, si),
                            }}
                            data-testid="ui-chart-seg"
                          />
                        );
                      })}
                    </div>
                    {tipFor === i && (
                      <div
                        className={cn('ui-chart-tip', tipEdge)}
                        style={{ bottom: `calc(${stackPct} + 10px)` }}
                        aria-hidden="true"
                      >
                        {segments.map((s, si) => (
                          <span key={s.key} className="ui-chart-tip-row">
                            <span
                              className="ui-chart-tip-swatch"
                              style={{ background: colorOf(s, si) }}
                            />
                            <span className="ui-chart-tip-row-label">{s.label}</span>
                            <span className="ui-chart-tip-row-value">
                              {fmt(Math.max(0, d.values[s.key] ?? 0))}
                            </span>
                          </span>
                        ))}
                        <span className="ui-chart-tip-total">Total {fmt(total)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ui-chart-names" aria-hidden="true">
          {data.map((d) => (
            <span key={d.label} className="ui-chart-name" title={d.label}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
      {legend && (
        <ul className="ui-chart-legend">
          {segments.map((s, si) => (
            <li key={s.key} className="ui-chart-legend-item">
              <span className="ui-chart-legend-swatch" style={{ background: colorOf(s, si) }} />
              <span className="ui-chart-legend-label">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
