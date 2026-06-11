import * as React from 'react';

import { cn } from '../lib/cn.js';

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
  /** Representación: barras (default) o línea con puntos (U-02). Misma escala,
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

// Barras verticales de §10.16 (revisión U-01): color constante (nunca se atenúa el
// resto), sin cifras dentro de las barras y tooltip lateral al hover/focus con el
// valor (y comparación/delta si existen). CSS-bars (divs); el alto en % por barra.
export function Chart({
  data,
  height = 248,
  formatValue,
  kind = 'bars',
  selected,
  onSelect,
  ariaLabel,
  className,
  'data-testid': testid,
}: ChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const [tipFor, setTipFor] = React.useState<number | null>(null);
  // El máximo cubre valor y comparación para que ambas barras compartan escala.
  const max = Math.max(
    1,
    ...data.map((b) => Math.max(b.value, b.compareValue ?? Number.NEGATIVE_INFINITY)),
  );

  if (kind === 'line') {
    return (
      <ChartLine
        data={data}
        height={height}
        fmt={fmt}
        max={max}
        tipFor={tipFor}
        setTipFor={setTipFor}
        ariaLabel={ariaLabel}
        className={className}
        testid={testid}
      />
    );
  }

  return (
    <div
      className={cn('ui-chart', className)}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
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
          <>
            <div className="ui-chart-pair">
              {comparePct != null && (
                <div className="ui-chart-bar ui-chart-bar-compare" style={{ height: comparePct }} />
              )}
              <div className="ui-chart-bar ui-chart-bar-value" style={{ height: valuePct }} />
              {tipFor === i && (
                <div
                  className={cn('ui-chart-tip', tipEdge)}
                  style={{ bottom: `calc(${valuePct} + 8px)` }}
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
            <span className="ui-chart-name">{bar.label}</span>
          </>
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
  );
}

// Variante línea (U-02): polyline + puntos sobre la misma escala que las barras.
// Los "hotzones" (una franja invisible por dato) reciben hover/focus y disparan
// el MISMO tooltip lateral; los labels van en una fila bajo el lienzo, alineados
// con los centros de columna ((i + 0.5) / n).
function ChartLine({
  data,
  height,
  fmt,
  max,
  tipFor,
  setTipFor,
  ariaLabel,
  className,
  testid,
}: {
  data: ChartBar[];
  height: number;
  fmt: (v: number) => string;
  max: number;
  tipFor: number | null;
  setTipFor: React.Dispatch<React.SetStateAction<number | null>>;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  testid?: string | undefined;
}): React.ReactElement {
  const n = Math.max(1, data.length);
  const xPct = (i: number): number => ((i + 0.5) / n) * 100;
  const yPct = (v: number): number => (v / max) * 100;
  const points = (pick: (b: ChartBar) => number | undefined): string =>
    data
      .map((b, i) => {
        const v = pick(b);
        return v == null ? null : `${xPct(i)},${100 - yPct(v)}`;
      })
      .filter(Boolean)
      .join(' ');
  const valuePoints = points((b) => b.value);
  const comparePoints = points((b) => b.compareValue);
  const hasCompare = data.some((b) => b.compareValue != null);

  return (
    <div
      className={cn('ui-chart ui-chart-line', className)}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-chart-line-canvas">
        <svg
          className="ui-chart-line-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {hasCompare && <polyline className="ui-chart-line-path-compare" points={comparePoints} />}
          <polyline className="ui-chart-line-path" points={valuePoints} />
        </svg>
        {data.map((bar, i) => {
          const valueLabel = bar.valueText ?? fmt(bar.value);
          const compareLabel =
            bar.compareValue != null ? (bar.compareText ?? fmt(bar.compareValue)) : null;
          const aria = [valueLabel, compareLabel, bar.tipExtra].filter(Boolean).join(' · ');
          const tipEdge =
            i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
          return (
            <React.Fragment key={bar.label}>
              {bar.compareValue != null && (
                <span
                  className="ui-chart-dot ui-chart-dot-compare"
                  style={{ left: `${xPct(i)}%`, bottom: `${yPct(bar.compareValue)}%` }}
                />
              )}
              <span
                className="ui-chart-dot"
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
              {tipFor === i && (
                <div
                  className={cn('ui-chart-tip', tipEdge)}
                  style={
                    tipEdge
                      ? { bottom: `calc(${yPct(bar.value)}% + 10px)` }
                      : {
                          left: `${xPct(i)}%`,
                          bottom: `calc(${yPct(bar.value)}% + 10px)`,
                        }
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
      <div className="ui-chart-line-names">
        {data.map((bar) => (
          <span key={bar.label} className="ui-chart-name">
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
