import { Sparkline } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { numField, toRecords, useGenericData } from './useGenericData.js';

interface GenericKpiProps {
  spec: GenericSpec;
}

// KPI parametrizable: un valor grande + etiqueta + sparkline opcional. `spec.fields[0]` es
// el campo del valor; `spec.fields[1]` (opcional) un campo array de números para la sparkline.
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

  return (
    <div className="dash-generic dash-generic--kpi" data-testid="dash-generic-kpi">
      <span className="dash-generic-kpi-label">{spec.title}</span>
      <span className="dash-generic-kpi-value">
        {isError ? '—' : isLoading ? '…' : value != null ? formatNumber(value) : '—'}
      </span>
      {series.length >= 2 && <Sparkline data={series} ariaLabel={`Tendencia de ${spec.title}`} />}
    </div>
  );
}

const NUMBER_FMT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
function formatNumber(value: number): string {
  return NUMBER_FMT.format(value);
}
