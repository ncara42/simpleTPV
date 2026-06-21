import { ComparisonBars, type SeriesItem, ShareDonut, TrendArea, TrendLine } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { numField, textField, toRecords, useGenericData } from './useGenericData.js';

interface GenericChartProps {
  spec: GenericSpec;
}

// Widget de gráfico parametrizable: delega en las moléculas de dataviz (#203, F2). `spec.fields`
// define [labelField, valueField, ...]. El `type` elige la molécula con su diseño horneado (orden,
// cap de barras, eje temporal, guardia donut→barras). Conserva el contrato del agente (type+fields)
// — el diseño mejora SIN tocar el DSL. La capa de datos (useGenericData) vive aquí; las moléculas
// son presentacionales (reciben `items` + estados loading/error).
export function GenericChart({ spec }: GenericChartProps) {
  const { data, isLoading, isError } = useGenericData(spec);
  const [labelField, valueField] = spec.fields ?? [];

  const records = toRecords(data);
  const items: SeriesItem[] = labelField
    ? records.map((row) => ({
        label: textField(row, labelField),
        value: numField(row, valueField ?? 'value'),
      }))
    : [];

  const common = { title: spec.title, items, isLoading, isError };

  let chart;
  switch (spec.type) {
    case 'pie':
    case 'donut':
      chart = <ShareDonut {...common} />;
      break;
    case 'line':
      chart = <TrendLine {...common} />;
      break;
    case 'area':
      chart = <TrendArea {...common} />;
      break;
    // 'stacked' no tiene molécula propia (la serie multi-segmento quedó sin uso real, en retirada
    // por #164). Degrada a barras de comparación sobre el campo de valor principal.
    case 'stacked':
    case 'bar':
    default:
      chart = <ComparisonBars {...common} />;
      break;
  }

  return <div className="dash-generic dash-generic--chart">{chart}</div>;
}
