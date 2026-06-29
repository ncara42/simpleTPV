import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';
import { rampColor } from './ramp.js';

// Donut monocromo con cifra central (#264): variante circular de SegmentBar. Anillo de segmentos en
// la rampa azul (sin arcoíris) + total en el centro + leyenda de las primeras categorías.
// Presentacional: recibe la serie {label,value}; calcula cuotas y arcos por construcción.
export interface DonutStatItem {
  label: string;
  value: number;
}
export interface DonutStatProps {
  items: DonutStatItem[];
  format?: StatFormat;
  /** Cifra central; si se omite usa la suma de la serie. */
  centerValue?: number | null;
  /** Texto bajo la cifra central (p. ej. "6 familias"). */
  centerCaption?: string;
  /** Nº de categorías en la leyenda. */
  legendMax?: number;
  isLoading?: boolean;
  isError?: boolean;
}

const R = 70;
const CIRC = 2 * Math.PI * R; // ≈ 439.82
const STROKE = 22;

export function DonutStat({
  items,
  format = 'eur',
  centerValue,
  centerCaption,
  legendMax = 3,
  isLoading = false,
  isError = false,
}: DonutStatProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const clean = (items ?? []).filter((d) => Number.isFinite(d.value) && d.value > 0);
  if (clean.length === 0) return <WidgetStates state="empty" />;

  const total = clean.reduce((s, d) => s + d.value, 0);
  const center = centerValue ?? total;

  let offset = 0;
  const segments = clean.map((d, i) => {
    const frac = d.value / total;
    const len = frac * CIRC;
    const seg = { ...d, pct: frac * 100, len, offset: -offset, colorIdx: i };
    offset += len;
    return seg;
  });

  return (
    <div className="dv-donutstat">
      <div className="dv-donutstat-ring">
        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Reparto">
          <g transform="rotate(-90 90 90)" fill="none" strokeWidth={STROKE}>
            {segments.map((s) => (
              <circle
                key={s.label}
                cx="90"
                cy="90"
                r={R}
                stroke={rampColor(s.colorIdx)}
                strokeDasharray={`${s.len.toFixed(1)} ${(CIRC - s.len).toFixed(1)}`}
                strokeDashoffset={s.offset.toFixed(1)}
              />
            ))}
          </g>
        </svg>
        <div className="dv-donutstat-center">
          <span className="dv-donutstat-value">{formatValue(center, format)}</span>
          {centerCaption ? <span className="dv-donutstat-caption">{centerCaption}</span> : null}
        </div>
      </div>
      <ul className="dv-donutstat-legend">
        {segments.slice(0, legendMax).map((s) => (
          <li key={s.label} className="dv-donutstat-legend-row">
            <span
              className="dv-donutstat-legend-dot"
              style={{ background: rampColor(s.colorIdx) }}
            />
            <span className="dv-donutstat-legend-label">{s.label}</span>
            <span className="dv-donutstat-legend-pct">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
