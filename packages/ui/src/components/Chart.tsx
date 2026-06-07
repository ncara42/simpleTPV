import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface ChartBar {
  /** Etiqueta bajo la barra (también la key de selección). */
  label: string;
  /** Valor principal (barra de acento de marca). */
  value: number;
  /** Valor de comparación opcional (barra atenuada al lado, p. ej. "ayer"). */
  compareValue?: number;
  /** Texto dentro de la barra de valor; por defecto, `value` formateado. */
  valueText?: string;
  /** Texto dentro de la barra de comparación; por defecto, `compareValue` formateado. */
  compareText?: string;
}

export interface ChartProps {
  data: ChartBar[];
  /** Alto del lienzo de barras en px. Por defecto 248 (§10.16). */
  height?: number;
  /** Formatea números a texto dentro de la barra cuando no se aporta `*Text`. */
  formatValue?: (value: number) => string;
  /** Etiqueta seleccionada: atenúa las demás columnas (mismo gesto que el hover). */
  selected?: string;
  /** Si se aporta, cada columna es un `<button>` que emite su `label` al pulsarla. */
  onSelect?: (label: string) => void;
  /** Etiqueta accesible del conjunto. */
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

// Barras verticales de §10.16: comparación neutra (--ui-border-strong) + valor en
// gradiente de marca sobre una línea base, cifra vertical dentro y "enfocar atenuando
// el resto". CSS-bars (divs) como en el dashboard; el alto en % lo fija cada barra.
export function Chart({
  data,
  height = 248,
  formatValue,
  selected,
  onSelect,
  ariaLabel,
  className,
  'data-testid': testid,
}: ChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  // El máximo cubre valor y comparación para que ambas barras compartan escala.
  const max = Math.max(
    1,
    ...data.map((b) => Math.max(b.value, b.compareValue ?? Number.NEGATIVE_INFINITY)),
  );
  const hasSelection = selected != null && data.some((b) => b.label === selected);

  return (
    <div
      className={cn('ui-chart', hasSelection && 'has-selection', className)}
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
        const inner = (
          <>
            <div className="ui-chart-pair">
              {comparePct != null && (
                <div className="ui-chart-bar ui-chart-bar-compare" style={{ height: comparePct }}>
                  <span className="ui-chart-bar-text">
                    {bar.compareText ?? fmt(bar.compareValue!)}
                  </span>
                </div>
              )}
              <div className="ui-chart-bar ui-chart-bar-value" style={{ height: valuePct }}>
                <span className="ui-chart-bar-text">{bar.valueText ?? fmt(bar.value)}</span>
              </div>
            </div>
            <span className="ui-chart-name">{bar.label}</span>
          </>
        );
        const groupClass = cn('ui-chart-group', isSelected && 'is-selected');
        const style = { '--i': i } as React.CSSProperties;
        return onSelect ? (
          <button
            key={bar.label}
            type="button"
            className={groupClass}
            style={style}
            aria-pressed={isSelected}
            aria-label={`${bar.label}: ${bar.valueText ?? fmt(bar.value)}`}
            onClick={() => onSelect(bar.label)}
            data-testid="ui-chart-group"
          >
            {inner}
          </button>
        ) : (
          <div key={bar.label} className={groupClass} style={style} data-testid="ui-chart-group">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
