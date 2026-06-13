import * as React from 'react';

import { cn } from '../lib/cn.js';
import { monotonePath, niceTicks, type Point } from '../lib/curve.js';

export interface ChartBar {
  /** Etiqueta bajo la barra (también la key de selección). */
  label: string;
  /** Valor principal (barra de acento de marca). */
  value: number;
  /** Valor de comparación opcional (barra neutra al lado, p. ej. "ayer"). */
  compareValue?: number;
  /** Texto del valor en el tooltip y el aria; por defecto, `value` formateado. */
  valueText?: string;
  /** Texto de la comparación en el tooltip; por defecto, `compareValue` formateado. */
  compareText?: string;
  /** Línea extra del tooltip (p. ej. el delta "+12 %"). */
  tipExtra?: string;
}

export interface ChartProps {
  data: ChartBar[];
  /** Alto del lienzo de barras en px. Por defecto 248 (§10.16). */
  height?: number;
  /** Formatea números a texto en tooltip/aria cuando no se aporta `*Text`. */
  formatValue?: (value: number) => string;
  /** Formatea las etiquetas del eje Y; por defecto usa `formatValue`. */
  formatAxis?: (value: number) => string;
  /** Líneas de referencia + eje Y con pasos redondos (estilo cuadro de mando). Por defecto, true. */
  showGrid?: boolean;
  /** Representación: barras (default) o línea con área (U-02). Misma escala,
   *  mismos labels y mismo tooltip lateral en ambas. */
  kind?: 'bars' | 'line';
  /** Etiqueta seleccionada: solo semántica (aria-pressed); no altera el color. */
  selected?: string;
  /** Si se aporta, cada columna es un `<button>` que emite su `label` al pulsarla. */
  onSelect?: (label: string) => void;
  /** Etiqueta accesible del conjunto. */
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

const GRID_TICKS = 4;

/** Capa de líneas de referencia + etiquetas del eje Y, alineada con la base del plot. */
function ChartGrid({
  ticks,
  top,
  formatAxis,
}: {
  ticks: number[];
  top: number;
  formatAxis: (v: number) => string;
}): React.ReactElement {
  return (
    <div className="ui-chart-grid" aria-hidden="true">
      {ticks.map((t) => (
        <div key={t} className="ui-chart-grid-line" style={{ bottom: `${(t / top) * 100}%` }}>
          {t > 0 && <span className="ui-chart-axis">{formatAxis(t)}</span>}
        </div>
      ))}
    </div>
  );
}

// Barras verticales de §10.16 (revisión U-01): color constante (nunca se atenúa el
// resto), sin cifras dentro de las barras y tooltip lateral al hover/focus con el
// valor (y comparación/delta si existen). CSS-bars (divs); el alto en % por barra.
// Las dos variantes (barras y línea) comparten banda de plot + fila de etiquetas.
export function Chart({
  data,
  height = 248,
  formatValue,
  formatAxis,
  showGrid = true,
  kind = 'bars',
  selected,
  onSelect,
  ariaLabel,
  className,
  'data-testid': testid,
}: ChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const fmtAxis = (v: number): string => formatAxis?.(v) ?? fmt(v);
  const gradientId = React.useId();
  const [tipFor, setTipFor] = React.useState<number | null>(null);

  // El máximo cubre valor y comparación para que ambas series compartan escala.
  const rawMax = Math.max(
    1,
    ...data.map((b) => Math.max(b.value, b.compareValue ?? Number.NEGATIVE_INFINITY)),
  );
  const axis = showGrid ? niceTicks(rawMax, GRID_TICKS) : { top: rawMax, ticks: [] };
  const max = axis.top;

  const names = (
    <div className="ui-chart-names" aria-hidden="true">
      {data.map((bar) => (
        <span key={bar.label} className="ui-chart-name" title={bar.label}>
          {bar.label}
        </span>
      ))}
    </div>
  );

  if (kind === 'line') {
    return (
      <ChartLine
        data={data}
        height={height}
        fmt={fmt}
        fmtAxis={fmtAxis}
        max={max}
        ticks={axis.ticks}
        gradientId={gradientId}
        tipFor={tipFor}
        setTipFor={setTipFor}
        names={names}
        ariaLabel={ariaLabel}
        className={className}
        testid={testid}
      />
    );
  }

  return (
    <div
      className={cn('ui-chart ui-chart-bars', className)}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-chart-plot">
        {showGrid && <ChartGrid ticks={axis.ticks} top={max} formatAxis={fmtAxis} />}
        <div className="ui-chart-cols">
          {data.map((bar, i) => {
            const isSelected = bar.label === selected;
            const valuePct = `${((bar.value / max) * 100).toFixed(2)}%`;
            const comparePct =
              bar.compareValue != null ? `${((bar.compareValue / max) * 100).toFixed(2)}%` : null;
            const valueLabel = bar.valueText ?? fmt(bar.value);
            const compareLabel =
              bar.compareValue != null ? (bar.compareText ?? fmt(bar.compareValue)) : null;
            // Tooltip anclado a la cima de la barra de valor; en los bordes se alinea
            // al lado interior para no salirse del panel.
            const tipEdge =
              i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
            const inner = (
              <div className="ui-chart-pair">
                {comparePct != null && (
                  <div
                    className="ui-chart-bar ui-chart-bar-compare"
                    style={{ height: comparePct }}
                  />
                )}
                <div className="ui-chart-bar ui-chart-bar-value" style={{ height: valuePct }} />
                {tipFor === i && (
                  <div
                    className={cn('ui-chart-tip', tipEdge)}
                    style={{ bottom: `calc(${valuePct} + 10px)` }}
                    aria-hidden="true"
                  >
                    <span className="ui-chart-tip-value">{valueLabel}</span>
                    {compareLabel != null && (
                      <span className="ui-chart-tip-compare">{compareLabel}</span>
                    )}
                    {bar.tipExtra != null && (
                      <span className="ui-chart-tip-extra">{bar.tipExtra}</span>
                    )}
                  </div>
                )}
              </div>
            );
            const aria = [valueLabel, compareLabel, bar.tipExtra].filter(Boolean).join(' · ');
            const shared = {
              style: { '--i': i } as React.CSSProperties,
              onMouseEnter: () => setTipFor(i),
              onMouseLeave: () => setTipFor((v) => (v === i ? null : v)),
              onFocus: () => setTipFor(i),
              onBlur: () => setTipFor((v) => (v === i ? null : v)),
              'data-testid': 'ui-chart-group',
            };
            return onSelect ? (
              <button
                key={bar.label}
                type="button"
                className="ui-chart-group"
                aria-pressed={isSelected}
                aria-label={`${bar.label}: ${aria}`}
                onClick={() => onSelect(bar.label)}
                {...shared}
              >
                {inner}
              </button>
            ) : (
              <div
                key={bar.label}
                className="ui-chart-group"
                tabIndex={0}
                aria-label={`${bar.label}: ${aria}`}
                {...shared}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
      {names}
    </div>
  );
}

// Variante línea (U-02): área con gradiente + curva monótona sobre la misma escala
// que las barras. Los "hotzones" (una franja invisible por dato) reciben hover/focus
// y disparan el MISMO tooltip lateral, con guía vertical (crosshair) y punto resaltado.
function ChartLine({
  data,
  height,
  fmt,
  fmtAxis,
  max,
  ticks,
  gradientId,
  tipFor,
  setTipFor,
  names,
  ariaLabel,
  className,
  testid,
}: {
  data: ChartBar[];
  height: number;
  fmt: (v: number) => string;
  fmtAxis: (v: number) => string;
  max: number;
  ticks: number[];
  gradientId: string;
  tipFor: number | null;
  setTipFor: React.Dispatch<React.SetStateAction<number | null>>;
  names: React.ReactNode;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  testid?: string | undefined;
}): React.ReactElement {
  const n = Math.max(1, data.length);
  const xPct = (i: number): number => ((i + 0.5) / n) * 100;
  const yPct = (v: number): number => (v / max) * 100;

  const valuePts: Point[] = data.map((b, i) => [xPct(i), 100 - yPct(b.value)]);
  const comparePts: Point[] = data
    .map((b, i): Point | null =>
      b.compareValue != null ? [xPct(i), 100 - yPct(b.compareValue)] : null,
    )
    .filter((p): p is Point => p != null);
  const valuePath = monotonePath(valuePts);
  const comparePath = monotonePath(comparePts);
  const hasCompare = comparePts.length > 0;
  // El área cierra la curva contra la línea base (y = 100) y vuelve al inicio.
  const firstX = valuePts[0]?.[0] ?? 0;
  const lastX = valuePts[valuePts.length - 1]?.[0] ?? 100;
  const areaPath = valuePath
    ? `${valuePath} L ${lastX.toFixed(2)},100 L ${firstX.toFixed(2)},100 Z`
    : '';

  return (
    <div
      className={cn('ui-chart ui-chart-line', className)}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-chart-plot">
        {ticks.length > 0 && <ChartGrid ticks={ticks} top={max} formatAxis={fmtAxis} />}
        <div className="ui-chart-line-canvas">
          <svg
            className="ui-chart-line-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && (
              <path className="ui-chart-line-area" d={areaPath} fill={`url(#${gradientId})`} />
            )}
            {hasCompare && (
              <path
                className="ui-chart-line-path-compare"
                d={comparePath}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path className="ui-chart-line-path" d={valuePath} vectorEffect="non-scaling-stroke" />
          </svg>
          {data.map((bar, i) => {
            const valueLabel = bar.valueText ?? fmt(bar.value);
            const compareLabel =
              bar.compareValue != null ? (bar.compareText ?? fmt(bar.compareValue)) : null;
            const aria = [valueLabel, compareLabel, bar.tipExtra].filter(Boolean).join(' · ');
            const tipEdge =
              i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
            const active = tipFor === i;
            return (
              <React.Fragment key={bar.label}>
                {active && (
                  <span
                    className="ui-chart-crosshair"
                    style={{ left: `${xPct(i)}%` }}
                    aria-hidden="true"
                  />
                )}
                {bar.compareValue != null && (
                  <span
                    className="ui-chart-dot ui-chart-dot-compare"
                    style={{ left: `${xPct(i)}%`, bottom: `${yPct(bar.compareValue)}%` }}
                  />
                )}
                <span
                  className={cn('ui-chart-dot', active && 'is-active')}
                  style={{ left: `${xPct(i)}%`, bottom: `${yPct(bar.value)}%` }}
                />
                <div
                  className="ui-chart-hotzone"
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                  tabIndex={0}
                  aria-label={`${bar.label}: ${aria}`}
                  onMouseEnter={() => setTipFor(i)}
                  onMouseLeave={() => setTipFor((v) => (v === i ? null : v))}
                  onFocus={() => setTipFor(i)}
                  onBlur={() => setTipFor((v) => (v === i ? null : v))}
                  data-testid="ui-chart-group"
                />
                {active && (
                  <div
                    className={cn('ui-chart-tip', tipEdge)}
                    style={
                      tipEdge
                        ? { bottom: `calc(${yPct(bar.value)}% + 12px)` }
                        : { left: `${xPct(i)}%`, bottom: `calc(${yPct(bar.value)}% + 12px)` }
                    }
                    aria-hidden="true"
                  >
                    <span className="ui-chart-tip-value">{valueLabel}</span>
                    {compareLabel != null && (
                      <span className="ui-chart-tip-compare">{compareLabel}</span>
                    )}
                    {bar.tipExtra != null && (
                      <span className="ui-chart-tip-extra">{bar.tipExtra}</span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {names}
    </div>
  );
}
