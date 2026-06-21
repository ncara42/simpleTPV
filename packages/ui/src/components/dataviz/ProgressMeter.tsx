import { StatLabel, WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Barra de progreso hacia un objetivo (cumplimiento de meta). NUEVA desde cero (equiv.
// ProgressBar de Tremor). Presentacional: recibe value/target; clampa el porcentaje a [0,100].
export interface ProgressMeterProps {
  label?: string;
  value: number | null | undefined;
  target?: number | null;
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

export function ProgressMeter({
  label,
  value,
  target,
  format = 'integer',
  isLoading = false,
  isError = false,
}: ProgressMeterProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  if (value == null || !Number.isFinite(value)) return <WidgetStates state="empty" />;

  const hasTarget = target != null && Number.isFinite(target) && target > 0;
  const pct = hasTarget ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;

  return (
    <div className="dv-progress">
      <div className="dv-progress-head">
        {label ? <StatLabel>{label}</StatLabel> : <span />}
        <span className="dv-progress-figure">
          {formatValue(value, format)}
          {hasTarget ? (
            <span className="dv-progress-target"> / {formatValue(target, format)}</span>
          ) : null}
        </span>
      </div>
      <div
        className="dv-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="dv-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
