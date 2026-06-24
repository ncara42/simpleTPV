import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Medidor semicircular (#264): arco de progreso de 180°, pista tenue + relleno en el acento, con la
// cifra centrada debajo. Para un % (margen, ocupación). Presentacional: clampa el ratio a [0,1].
export interface GaugeProps {
  value: number;
  /** Denominador para el ratio (value/max). Por defecto 100 (value ya en %). */
  max?: number;
  /** Texto central ya formateado; si se omite usa value con `format`. */
  valueText?: string;
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

// Longitud del arco semicircular r=50 → π·50 ≈ 157.08.
const ARC = Math.PI * 50;

export function Gauge({
  value,
  max = 100,
  valueText,
  format = 'percent',
  isLoading = false,
  isError = false,
}: GaugeProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  if (!Number.isFinite(value)) return <WidgetStates state="empty" />;

  const ratio = Math.max(0, Math.min(1, value / (max || 1)));
  const fill = ratio * ARC;
  const display = valueText ?? formatValue(value, format);

  return (
    <div className="dv-gauge">
      <svg viewBox="0 0 120 66" className="dv-gauge-svg" role="img" aria-label={display}>
        <path className="dv-gauge-track" d="M10,62 A50,50 0 0 1 110,62" />
        <path
          className="dv-gauge-fill"
          d="M10,62 A50,50 0 0 1 110,62"
          strokeDasharray={`${fill.toFixed(1)} ${ARC.toFixed(1)}`}
        />
      </svg>
      <span className="dv-gauge-value">{display}</span>
    </div>
  );
}
