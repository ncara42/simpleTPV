import {
  DeltaBadge,
  MiniSparkline,
  type MiniSparklineProps,
  StatLabel,
  StatValue,
  WidgetStates,
} from './atoms.js';
import type { StatFormat } from './format.js';

// Pieza KPI canónica (sustituye el markup crudo de GenericKpi): rótulo + delta opcional + valor
// grande + sparkline opcional. Presentacional: recibe datos por props; la capa de datos (app)
// resuelve `useGenericData` y le pasa value/delta/spark. Estados loading/error horneados.
export interface KpiTileProps {
  label: string;
  value: number | null | undefined;
  format?: StatFormat;
  size?: 'sm' | 'md' | 'lg';
  delta?: number | null;
  deltaFormat?: 'percent' | 'eur';
  /** Para métricas donde bajar es bueno (descuento, devolución). */
  invertDelta?: boolean;
  spark?: number[];
  sparkTone?: MiniSparklineProps['tone'];
  /** Si se indica, muestra el estado en vez del valor. */
  state?: 'loading' | 'error';
}

export function KpiTile({
  label,
  value,
  format = 'decimal',
  size = 'md',
  delta,
  deltaFormat = 'percent',
  invertDelta = false,
  spark,
  sparkTone,
  state,
}: KpiTileProps) {
  return (
    <div className="dv-kpi-tile">
      <div className="dv-kpi-head">
        <StatLabel>{label}</StatLabel>
        {delta != null ? (
          <DeltaBadge delta={delta} format={deltaFormat} invert={invertDelta} />
        ) : null}
      </div>
      {state ? (
        <WidgetStates state={state} />
      ) : (
        <StatValue value={value} format={format} size={size} />
      )}
      {spark && spark.length >= 2 ? (
        <MiniSparkline data={spark} tone={sparkTone ?? 'accent'} />
      ) : null}
    </div>
  );
}
