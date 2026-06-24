import type { ReactNode } from 'react';

import { formatValue, type StatFormat } from './format.js';

// Celda de ribbon compacto (#264): métrica en una línea — rótulo + cifra a la izquierda y una
// mini-viz (sparkline, barras, dots) a la derecha. Para la banda densa de métricas secundarias
// (tickets, margen bruto, COGS…). Presentacional. Va dentro de KpiGrid (rejilla conectada).
export interface RibbonStatProps {
  label: string;
  value: number | null | undefined;
  format?: StatFormat;
  valueText?: string;
  /** Mini-visualización a la derecha (SparkArea, SparkBars, dots…). */
  aside?: ReactNode;
}

export function RibbonStat({ label, value, format = 'eur0', valueText, aside }: RibbonStatProps) {
  return (
    <div className="dv-ribbon">
      <span className="dv-ribbon-main">
        <span className="dv-ribbon-label">{label}</span>
        <span className="dv-ribbon-value">{valueText ?? formatValue(value, format)}</span>
      </span>
      {aside ? <span className="dv-ribbon-aside">{aside}</span> : null}
    </div>
  );
}
