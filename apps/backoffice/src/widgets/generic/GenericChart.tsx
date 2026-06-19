import { Chart, type ChartBar, PieChart, type PieSlice, StackedBarChart } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { numField, textField, toRecords, useGenericData } from './useGenericData.js';

interface GenericChartProps {
  spec: GenericSpec;
}

// Widget de gráfico parametrizable. `spec.fields` define [labelField, valueField, ...series].
// El `type` decide la representación: bar/line/area (Chart), pie/donut (PieChart), stacked
// (StackedBarChart). Hace su propia query contra `spec.endpoint`.
export function GenericChart({ spec }: GenericChartProps) {
  const { data, isLoading, isError } = useGenericData(spec);
  const [labelField, valueField, ...seriesFields] = spec.fields ?? [];

  if (isError)
    return <ChartFallback title={spec.title} message="No se pudieron cargar los datos." />;
  if (isLoading) return <ChartFallback title={spec.title} message="Cargando…" />;

  const records = toRecords(data);
  if (records.length === 0 || !labelField) {
    return <ChartFallback title={spec.title} message="Sin datos." />;
  }

  if (spec.type === 'pie' || spec.type === 'donut') {
    const slices: PieSlice[] = records.map((row) => ({
      label: textField(row, labelField),
      value: numField(row, valueField ?? 'value'),
    }));
    return (
      <figure className="dash-generic dash-generic--chart">
        <figcaption className="dash-generic-title">{spec.title}</figcaption>
        <PieChart data={slices} donut={spec.type === 'donut'} ariaLabel={spec.title} />
      </figure>
    );
  }

  if (spec.type === 'stacked') {
    const segments = seriesFields.length > 0 ? seriesFields : valueField ? [valueField] : [];
    return (
      <figure className="dash-generic dash-generic--chart">
        <figcaption className="dash-generic-title">{spec.title}</figcaption>
        <StackedBarChart
          data={records.map((row) => ({
            label: textField(row, labelField),
            values: Object.fromEntries(segments.map((s) => [s, numField(row, s)])),
          }))}
          segments={segments.map((s) => ({ key: s, label: s }))}
          ariaLabel={spec.title}
        />
      </figure>
    );
  }

  // bar | line | area
  const bars: ChartBar[] = records.map((row) => ({
    label: textField(row, labelField),
    value: numField(row, valueField ?? 'value'),
  }));
  const kind = spec.type === 'bar' ? 'bars' : spec.type === 'area' ? 'area' : 'line';
  return (
    <figure className="dash-generic dash-generic--chart">
      <figcaption className="dash-generic-title">{spec.title}</figcaption>
      <Chart data={bars} kind={kind} ariaLabel={spec.title} />
    </figure>
  );
}

function ChartFallback({ title, message }: { title: string; message: string }) {
  return (
    <figure className="dash-generic dash-generic--chart">
      <figcaption className="dash-generic-title">{title}</figcaption>
      <p className="dash-generic-msg">{message}</p>
    </figure>
  );
}
