import type { DashboardPeriod } from '../lib/dashboard.js';
import { PERIOD_OPTIONS, type PeriodOption } from '../lib/period.js';

interface PeriodSegmentedProps {
  /** Periodo activo. */
  value: DashboardPeriod;
  /** Se invoca con el periodo elegido al pulsar un segmento. */
  onChange: (period: DashboardPeriod) => void;
  /** Segmentos a pintar (por defecto los 5 de `PERIOD_OPTIONS`: Hoy/Ayer/Semana/Mes/Año). */
  options?: readonly PeriodOption[];
  /** Etiqueta accesible del grupo (P066: el control siempre se titula "Periodo"). */
  label?: string;
  /** Clase extra opcional para el contenedor (p. ej. el float del Dashboard). */
  className?: string;
}

// Control segmentado puro y reutilizable para elegir el periodo (S-11). Botón por periodo;
// reutiliza el segmentado del repo (.bo-tabs/.bo-tab, el mismo de Inventario/Personal). No
// tiene estado propio: el periodo vive en el consumidor (useState del Dashboard / filtro de
// Ventas) y, encima, en la URL (?period=).
export function PeriodSegmented({
  value,
  onChange,
  options = PERIOD_OPTIONS,
  label = 'Periodo',
  className,
}: PeriodSegmentedProps) {
  return (
    <div
      className={`period-seg bo-tabs${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={label}
      data-testid="period-seg"
    >
      {options.map(({ value: opt, label: optLabel }) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            className={`bo-tab${active ? ' active' : ''}`}
            aria-pressed={active}
            data-testid={`period-opt-${opt}`}
            onClick={() => onChange(opt)}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}
