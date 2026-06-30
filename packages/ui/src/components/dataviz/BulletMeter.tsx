import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Bullet chart de objetivo (#264): barra de cumplimiento con tramo ACTUAL (sólido), PROYECCIÓN
// (tramo tenue punteado) y marca de OBJETIVO (línea tinta). La escala añade ~6% de holgura sobre el
// mayor de los tres para que el objetivo no quede pegado al filo. Presentacional.
export interface BulletMeterProps {
  value: number;
  target: number;
  /** Proyección a fin de periodo (tramo tenue). Opcional. */
  projection?: number;
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

const HEADROOM = 1.06;

export function BulletMeter({
  value,
  target,
  projection,
  format = 'eur',
  isLoading = false,
  isError = false,
}: BulletMeterProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return <WidgetStates state="empty" />;
  }

  const proj = projection != null && Number.isFinite(projection) ? projection : null;
  const scaleMax = Math.max(value, proj ?? 0, target) * HEADROOM;
  const toPct = (v: number): number => Math.max(0, Math.min(100, (v / scaleMax) * 100));

  const actualPct = toPct(value);
  const targetPct = toPct(target);
  const projPct = proj != null ? toPct(proj) : actualPct;
  const projWidth = Math.max(0, projPct - actualPct);

  // Cumplimiento sobre el objetivo con 1 decimal (es-ES, coma).
  const pctOfTarget = (v: number): string => ((v / target) * 100).toFixed(1).replace('.', ',');
  const actualOfTarget = pctOfTarget(value);
  const projOfTarget = proj != null ? pctOfTarget(proj) : null;

  // Etiquetas de valor (actual / objetivo) sobre la barra: si los dos importes caen muy juntos se
  // solaparían (cumplimiento ≈ 100 %). Cuando están cerca, anclamos la de menor % por la derecha
  // (texto hacia la izquierda) y la de mayor % por la izquierda (texto hacia la derecha): abren
  // hueco a cada lado del punto en vez de pisarse. Si no, ambas anclan a la izquierda (original).
  const tagsClose = Math.abs(targetPct - actualPct) < 18;
  const actualTagStyle =
    tagsClose && actualPct <= targetPct
      ? { right: `${(100 - actualPct).toFixed(2)}%` }
      : { left: `${actualPct.toFixed(2)}%` };
  const targetTagStyle =
    tagsClose && targetPct < actualPct
      ? { right: `${(100 - targetPct).toFixed(2)}%` }
      : { left: `${targetPct.toFixed(2)}%` };

  return (
    <div className="dv-bullet">
      <div className="dv-bullet-track">
        <span className="dv-bullet-actual" style={{ width: `${actualPct}%` }} />
        {projWidth > 0 ? (
          <span
            className="dv-bullet-proj"
            style={{ left: `${actualPct}%`, width: `${projWidth}%` }}
          />
        ) : null}
        <span className="dv-bullet-target" style={{ left: `${targetPct}%` }} />
        <span className="dv-bullet-tag dv-bullet-tag--actual" style={actualTagStyle}>
          {formatValue(value, format)}
        </span>
        <span className="dv-bullet-tag dv-bullet-tag--target" style={targetTagStyle}>
          {formatValue(target, format)}
        </span>
      </div>
      <div className="dv-bullet-legend">
        <span className="dv-bullet-legend-item">
          <span className="dv-bullet-legend-swatch dv-bullet-legend-swatch--actual" />
          Actual <strong>{actualOfTarget}%</strong>
        </span>
        {projOfTarget != null ? (
          <span className="dv-bullet-legend-item">
            <span className="dv-bullet-legend-swatch dv-bullet-legend-swatch--proj" />
            Proyección <strong>{projOfTarget}%</strong>
          </span>
        ) : null}
        <span className="dv-bullet-legend-item">
          <span className="dv-bullet-legend-swatch dv-bullet-legend-swatch--target" />
          Objetivo
        </span>
      </div>
    </div>
  );
}
