import { KpiTile, type KpiTileProps } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { numField, toRecords, useGenericData } from './useGenericData.js';

interface GenericKpiProps {
  spec: GenericSpec;
}

// KPI parametrizable: delega en la molécula KpiTile (diseño + estados loading/error horneados).
// `spec.fields[0]` es el campo del valor; `spec.fields[1]` (opcional) un campo array de números
// para la sparkline. Conserva el contrato del agente (type:'kpi' + fields) — F2 (#203) mejora el
// diseño SIN tocar el DSL. La capa de datos (useGenericData) vive aquí; la molécula es presentacional.
export function GenericKpi({ spec }: GenericKpiProps) {
  const { data, isLoading, isError } = useGenericData(spec);
  const [valueField, seriesField] = spec.fields ?? [];
  const records = toRecords(data);
  const row = records[0];

  const value = row && valueField ? numField(row, valueField) : null;
  const series =
    row && seriesField && Array.isArray(row[seriesField])
      ? (row[seriesField] as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n))
      : [];

  const state = isError ? 'error' : isLoading ? 'loading' : undefined;

  // Construcción condicional: con `exactOptionalPropertyTypes` no se pasa `undefined` a props
  // opcionales (spark/state) — se omiten cuando no aplican.
  const kpiProps: KpiTileProps = {
    label: spec.title,
    value,
    format: 'decimal',
    ...(series.length >= 2 ? { spark: series } : {}),
    ...(state ? { state } : {}),
  };

  return (
    <div className="dash-generic dash-generic--kpi" data-testid="dash-generic-kpi">
      <KpiTile {...kpiProps} />
    </div>
  );
}
