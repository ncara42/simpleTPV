import {
  ChartGrid,
  ComparisonBars,
  DataGrid,
  type DataGridColumn,
  KpiRow,
  KpiTile,
  PanelShell,
  ProgressMeter,
  RankBarList,
  SectionHeader,
  SegmentBar,
  type SeriesItem,
  ShareDonut,
  TrendArea,
  TrendLine,
} from '@simpletpv/ui';

import type { GenericSpec, PieceSpec } from '../../lib/dashboard-layout.js';
import { recipeChartColumns } from '../../lib/dashboard-pieces.js';
import {
  type GenericDataSource,
  numField,
  textField,
  toRecords,
  useGenericData,
} from './useGenericData.js';

// Render de un panel v2 (#204): monta PanelShell + la receta (KpiRow/ChartGrid) y rellena cada
// slot despachando cada hoja-pieza a su molécula. La geometría sale de la receta (no del agente);
// cada pieza resuelve sus datos por separado (useGenericData) → estados loading/error horneados.

const MAX_KPI_COLUMNS = 4;

export function GenericPanel({ spec }: { spec: GenericSpec }) {
  const recipe = spec.recipe ?? 'kpiRow+twoCharts';
  const density = spec.density ?? 'comfortable';
  const kpis = spec.slots?.kpis ?? [];
  const charts = spec.slots?.charts ?? [];
  const kpiColumns = Math.min(Math.max(kpis.length, 1), MAX_KPI_COLUMNS) as 1 | 2 | 3 | 4;
  const emphasis = recipe === 'heroChart+sideStats' ? 'hero' : 'normal';

  return (
    <div className="dash-generic dash-generic--panel" data-testid="dash-generic-panel">
      <PanelShell title={spec.title} density={density}>
        {kpis.length > 0 ? (
          <KpiRow columns={kpiColumns}>
            {kpis.map((piece, i) => (
              <PieceWidget key={`${piece.piece}-${i}`} piece={piece} />
            ))}
          </KpiRow>
        ) : null}
        {charts.length > 0 ? (
          <ChartGrid columns={recipeChartColumns(recipe)} emphasis={emphasis}>
            {charts.map((piece, i) => (
              <PieceWidget key={`${piece.piece}-${i}`} piece={piece} />
            ))}
          </ChartGrid>
        ) : null}
      </PanelShell>
    </div>
  );
}

// Construye la fuente de datos mínima de una pieza (endpoint + params + period/storeId).
function toDataSource(piece: PieceSpec): GenericDataSource {
  return {
    endpoint: piece.endpoint ?? '',
    ...(piece.params ? { params: piece.params } : {}),
    ...(piece.period ? { period: piece.period } : {}),
    ...(piece.storeId != null ? { storeId: piece.storeId } : {}),
  };
}

// Mapea los registros del endpoint a las series {label,value} que consumen las gráficas.
function seriesOf(piece: PieceSpec, records: Array<Record<string, unknown>>): SeriesItem[] {
  const labelField = piece.labelField ?? 'label';
  const valueField = piece.valueField ?? 'value';
  return records.map((row) => ({
    label: textField(row, labelField),
    value: numField(row, valueField),
  }));
}

// Una hoja-pieza con sus datos: fetch por pieza + despacho a la molécula con su diseño horneado.
function PieceWidget({ piece }: { piece: PieceSpec }) {
  const { data, isLoading, isError } = useGenericData(toDataSource(piece));
  const records = toRecords(data);
  const title = piece.title ?? '';
  const format = piece.format; // PieceFormat ≡ StatFormat (mismo union); las moléculas lo clampan

  switch (piece.piece) {
    case 'kpiTile': {
      const row = records[0];
      // Distingue "ausente/null" (→ estado vacío '—') de un 0 real: numField devuelve 0 para null,
      // así que se comprueba la presencia de la clave antes de leerla.
      const value =
        row && piece.valueField && row[piece.valueField] != null
          ? numField(row, piece.valueField)
          : null;
      const delta = row && piece.deltaField ? numField(row, piece.deltaField) : undefined;
      const spark =
        row && piece.sparkField && Array.isArray(row[piece.sparkField])
          ? (row[piece.sparkField] as unknown[])
              .map((v) => Number(v))
              .filter((n) => Number.isFinite(n))
          : undefined;
      const state = isError ? 'error' : isLoading ? 'loading' : undefined;
      return (
        <KpiTile
          label={title}
          value={value}
          {...(format ? { format } : {})}
          {...(delta != null ? { delta } : {})}
          {...(spark && spark.length >= 2 ? { spark } : {})}
          {...(state ? { state } : {})}
        />
      );
    }
    case 'comparisonBars':
      return (
        <ComparisonBars
          title={title}
          items={seriesOf(piece, records)}
          isLoading={isLoading}
          isError={isError}
          {...(format ? { format } : {})}
          {...(piece.maxBars != null ? { maxBars: piece.maxBars } : {})}
        />
      );
    case 'trendLine':
      return (
        <TrendLine
          title={title}
          items={seriesOf(piece, records)}
          isLoading={isLoading}
          isError={isError}
          {...(format ? { format } : {})}
        />
      );
    case 'trendArea':
      return (
        <TrendArea
          title={title}
          items={seriesOf(piece, records)}
          isLoading={isLoading}
          isError={isError}
          {...(format ? { format } : {})}
        />
      );
    case 'shareDonut':
      return (
        <ShareDonut
          title={title}
          items={seriesOf(piece, records)}
          isLoading={isLoading}
          isError={isError}
          {...(format ? { format } : {})}
        />
      );
    // RankBarList/SegmentBar no traen título propio: se envuelven con SectionHeader (mismo h3 que
    // el resto de gráficas) para una jerarquía de títulos consistente y CSS de la librería.
    case 'rankBarList':
      return (
        <figure className="dv-chart">
          {title ? <SectionHeader title={title} /> : null}
          <RankBarList
            items={seriesOf(piece, records)}
            isLoading={isLoading}
            isError={isError}
            {...(format ? { format } : {})}
            {...(piece.maxRows != null ? { maxRows: piece.maxRows } : {})}
          />
        </figure>
      );
    case 'segmentBar':
      return (
        <figure className="dv-chart">
          {title ? <SectionHeader title={title} /> : null}
          <SegmentBar
            items={seriesOf(piece, records)}
            isLoading={isLoading}
            isError={isError}
            {...(format ? { format } : {})}
          />
        </figure>
      );
    case 'progressMeter': {
      const row = records[0];
      const value = row && piece.valueField ? numField(row, piece.valueField) : null;
      const target =
        piece.target ?? (row && piece.targetField ? numField(row, piece.targetField) : undefined);
      return (
        <ProgressMeter
          label={title}
          value={value}
          isLoading={isLoading}
          isError={isError}
          {...(target != null ? { target } : {})}
          {...(format ? { format } : {})}
        />
      );
    }
    case 'dataGrid': {
      const columns = dataGridColumns(piece, records);
      return (
        <DataGrid
          title={title}
          columns={columns}
          rows={records}
          isLoading={isLoading}
          isError={isError}
        />
      );
    }
    default:
      return null;
  }
}

// Columnas de un dataGrid: las explícitas de la pieza, o inferidas de las claves del primer registro.
function dataGridColumns(
  piece: PieceSpec,
  records: Array<Record<string, unknown>>,
): DataGridColumn[] {
  if (piece.columns && piece.columns.length > 0) {
    return piece.columns.map((c) => ({
      key: c.field,
      header: c.label,
      ...(c.format ? { format: c.format } : {}),
      ...(c.align ? { align: c.align } : {}),
    }));
  }
  const keys = records.length > 0 ? Object.keys(records[0]!) : [];
  return keys.map((field) => ({ key: field, header: field }));
}
