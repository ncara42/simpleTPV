import { ChartLegend, type ChartLegendItem, WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Barra única segmentada de reparto + leyenda. NUEVA desde cero (equiv. CategoryBar de Tremor).
// Alternativa compacta al donut para mostrar la composición de un total. Colorea por --ui-cat-*.
export interface SegmentBarItem {
  label: string;
  value: number;
}
export interface SegmentBarProps {
  items: SegmentBarItem[];
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

// 8 colores categóricos del tema; se reciclan si hay más segmentos.
const CAT_VARS = Array.from({ length: 8 }, (_, i) => `--ui-cat-${i + 1}`);

export function SegmentBar({
  items,
  format = 'percent',
  isLoading = false,
  isError = false,
}: SegmentBarProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const clean = (items ?? []).filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = clean.reduce((sum, s) => sum + s.value, 0);
  if (clean.length === 0 || total <= 0) return <WidgetStates state="empty" />;

  const segments = clean.map((s, i) => ({
    ...s,
    pct: (s.value / total) * 100,
    colorVar: CAT_VARS[i % CAT_VARS.length]!,
  }));
  // La leyenda muestra el % de reparto (el ancho del segmento ES ese %); el valor crudo (en su
  // `format`) va en el tooltip de cada segmento.
  const legend: ChartLegendItem[] = segments.map((s) => ({
    label: `${s.label} · ${Math.round(s.pct)}%`,
    colorVar: s.colorVar,
  }));

  return (
    <div className="dv-segment">
      <div className="dv-segment-bar" role="img" aria-label="Reparto por categoría">
        {segments.map((s, i) => (
          <span
            key={`${s.label}-${i}`}
            className="dv-segment-part"
            style={{ width: `${s.pct}%`, backgroundColor: `var(${s.colorVar})` }}
            title={`${s.label}: ${formatValue(s.value, format)}`}
          />
        ))}
      </div>
      <ChartLegend items={legend} />
    </div>
  );
}
