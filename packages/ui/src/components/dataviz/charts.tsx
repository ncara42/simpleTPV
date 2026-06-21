import { Chart } from '../Chart.js';
import { PieChart } from '../PieChart.js';
import { SectionHeader, WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';
import { RankBarList } from './RankBarList.js';

// Moléculas de gráficas: envuelven Chart/PieChart de @simpletpv/ui añadiendo título consistente
// (SectionHeader), estados horneados (WidgetStates) y formateo es-ES. Presentacionales: reciben
// `items` ya cargados (la capa de datos resuelve useGenericData y los pasa).

export interface SeriesItem {
  label: string;
  value: number;
}

interface SeriesChartBaseProps {
  title?: string;
  items: SeriesItem[];
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

// Núcleo común a barras/línea/área. `sort` ordena por valor desc (comparativa de categorías);
// `cap` acota el nº de puntos (las series temporales no se ordenan ni se acotan).
function SeriesChart({
  title,
  items,
  format = 'integer',
  kind,
  sort = false,
  cap,
  isLoading = false,
  isError = false,
}: SeriesChartBaseProps & { kind: 'bars' | 'line' | 'area'; sort?: boolean; cap?: number }) {
  let body;
  if (isLoading) body = <WidgetStates state="loading" />;
  else if (isError) body = <WidgetStates state="error" />;
  else {
    let data = (items ?? []).filter((d) => Number.isFinite(d.value));
    if (sort) data = [...data].sort((a, b) => b.value - a.value);
    if (cap) data = data.slice(0, cap);
    body =
      data.length === 0 ? (
        <WidgetStates state="empty" />
      ) : (
        <Chart
          data={data}
          kind={kind}
          formatValue={(v) => formatValue(v, format)}
          ariaLabel={title ?? 'Gráfica'}
        />
      );
  }
  return (
    <figure className="dv-chart">
      {title ? <SectionHeader title={title} /> : null}
      {body}
    </figure>
  );
}

// Comparación entre categorías (vendedores, familias, productos). Ordena desc y acota a `maxBars`.
export interface ComparisonBarsProps extends SeriesChartBaseProps {
  maxBars?: number;
}
const MAX_BARS = 12;
export function ComparisonBars({ maxBars = 8, ...rest }: ComparisonBarsProps) {
  return <SeriesChart {...rest} kind="bars" sort cap={Math.min(Math.max(1, maxBars), MAX_BARS)} />;
}

// Evolución temporal (línea). Mantiene el orden de la serie.
export function TrendLine(props: SeriesChartBaseProps) {
  return <SeriesChart {...props} kind="line" />;
}

// Evolución temporal (área). Variante de relleno de TrendLine.
export function TrendArea(props: SeriesChartBaseProps) {
  return <SeriesChart {...props} kind="area" />;
}

// Reparto de un total como donut, con GUARDIA horneada: si hay más de 6 categorías, degrada a
// RankBarList (una tarta con muchas porciones se ve mal). La guardia vive aquí, no en el prompt.
export interface ShareDonutProps extends SeriesChartBaseProps {
  /** Umbral de categorías por encima del cual se degrada a barras. */
  maxSlices?: number;
}
const MAX_SLICES = 6;
export function ShareDonut({
  title,
  items,
  format = 'integer',
  maxSlices = MAX_SLICES,
  isLoading = false,
  isError = false,
}: ShareDonutProps) {
  let body;
  if (isLoading) body = <WidgetStates state="loading" />;
  else if (isError) body = <WidgetStates state="error" />;
  else {
    const clean = (items ?? []).filter((d) => Number.isFinite(d.value) && d.value > 0);
    if (clean.length === 0) {
      body = <WidgetStates state="empty" />;
    } else if (clean.length > maxSlices) {
      // Degradación: demasiadas porciones → ranking de barras (más legible).
      body = <RankBarList items={clean} format={format} />;
    } else {
      body = (
        <PieChart
          data={clean}
          donut
          formatValue={(v) => formatValue(v, format)}
          ariaLabel={title ?? 'Reparto'}
        />
      );
    }
  }
  return (
    <figure className="dv-chart">
      {title ? <SectionHeader title={title} /> : null}
      {body}
    </figure>
  );
}
