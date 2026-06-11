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
