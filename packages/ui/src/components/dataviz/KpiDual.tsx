import { formatValue, type StatFormat } from './format.js';

// KPI dual (#264): dos métricas apiladas en una tarjeta, separadas por hairline. Empaqueta dos cifras
// relacionadas (margen + beneficio) en el espacio de una. Presentacional.
export interface KpiDualMetric {
  label: string;
  value: number | null | undefined;
  format?: StatFormat;
  valueText?: string;
}
export interface KpiDualProps {
  top: KpiDualMetric;
  bottom: KpiDualMetric;
  corner?: string;
}

function Metric({ label, value, format = 'eur', valueText }: KpiDualMetric) {
  return (
    <div className="dv-kpidual-cell">
      <span className="dv-stat-label">{label}</span>
      <span className="dv-kpidual-value">{valueText ?? formatValue(value, format)}</span>
    </div>
  );
}

export function KpiDual({ top, bottom, corner }: KpiDualProps) {
  return (
    <div className="dv-kpidual">
      {corner ? <span className="dv-kpistat-corner">{corner}</span> : null}
      <Metric {...top} />
      <Metric {...bottom} />
    </div>
  );
}
