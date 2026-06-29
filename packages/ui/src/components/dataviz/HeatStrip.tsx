import { WidgetStates } from './atoms.js';
import { heatColor, rampInk } from './ramp.js';

// Tira de mapa de calor (#264): una celda por franja, color por intensidad de la rampa azul mono.
// Lectura instantánea de los picos (la celda más saturada = el máximo). Marca el pico con un anillo.
// Presentacional: recibe la serie {label,value}; normaliza la intensidad a [0,1] sobre min..max.
export interface HeatCell {
  label: string;
  value: number;
}
export interface HeatStripProps {
  items: HeatCell[];
  /** Resalta con anillo la celda de mayor valor. Por defecto true. */
  markPeak?: boolean;
  /** Muestra la etiqueta dentro de cada celda. Por defecto true (false → tira mini sin texto). */
  showLabels?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function HeatStrip({
  items,
  markPeak = true,
  showLabels = true,
  isLoading = false,
  isError = false,
}: HeatStripProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const cells = (items ?? []).filter((c) => Number.isFinite(c.value));
  if (cells.length === 0) return <WidgetStates state="empty" />;

  const values = cells.map((c) => c.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const peakIdx = markPeak ? values.indexOf(max) : -1;

  return (
    <div
      className={`dv-heatstrip${showLabels ? '' : ' dv-heatstrip--mini'}`}
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
      role="img"
      aria-label="Intensidad por franja"
    >
      {cells.map((c, i) => {
        const t = (c.value - min) / span;
        const pct = 12 + t * 88;
        return (
          <div
            key={`${c.label}-${i}`}
            className={`dv-heatcell${i === peakIdx ? ' is-peak' : ''}`}
            style={{ background: heatColor(t), color: rampInk(pct) }}
            title={`${c.label}: ${c.value}`}
          >
            {showLabels ? c.label : null}
          </div>
        );
      })}
    </div>
  );
}

// Leyenda "Menos → Más" de la rampa (4 muestras). Se compone junto al título de la tarjeta.
export function HeatLegend() {
  const stops = [0.12, 0.4, 0.7, 1];
  return (
    <span className="dv-heat-legend">
      Menos
      <span className="dv-heat-legend-swatches">
        {stops.map((t) => (
          <span key={t} className="dv-heat-legend-dot" style={{ background: heatColor(t) }} />
        ))}
      </span>
      Más
    </span>
  );
}
