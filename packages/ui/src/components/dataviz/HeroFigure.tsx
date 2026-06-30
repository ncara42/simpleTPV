import { formatValue, type StatFormat } from './format.js';
import { SparkArea } from './SparkArea.js';

// Cifra-héroe (#264): panel a dos columnas — a la izquierda un rótulo + número gigante (54px) +
// chips de contexto; a la derecha una gráfica de área a toda altura. Para destacar LA cifra del mes.
// Presentacional.
export interface HeroFigureChip {
  text: string;
  tone?: 'neutral' | 'success' | 'danger';
}
export interface HeroFigureProps {
  eyebrow?: string;
  badge?: string;
  value: number | null | undefined;
  format?: StatFormat;
  valueText?: string;
  chips?: HeroFigureChip[];
  spark?: number[];
}

export function HeroFigure({
  eyebrow,
  badge,
  value,
  format = 'eur',
  valueText,
  chips = [],
  spark,
}: HeroFigureProps) {
  return (
    <div className="dv-herofigure">
      <div className="dv-herofigure-main">
        {eyebrow || badge ? (
          <span className="dv-herofigure-eyebrow">
            {eyebrow}
            {badge ? <span className="dv-herofigure-badge">{badge}</span> : null}
          </span>
        ) : null}
        <div className="dv-herofigure-value">{valueText ?? formatValue(value, format)}</div>
        {chips.length > 0 ? (
          <div className="dv-herofigure-chips">
            {chips.map((c, i) => (
              <span
                key={i}
                className={`dv-herofigure-chip dv-herofigure-chip--${c.tone ?? 'neutral'}`}
              >
                {c.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="dv-herofigure-chart">
        {spark && spark.length >= 2 ? <SparkArea data={spark} height="100%" /> : null}
      </div>
    </div>
  );
}
