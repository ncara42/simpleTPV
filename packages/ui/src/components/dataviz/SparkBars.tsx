import { rampMix } from './ramp.js';

// Mini barras de bolsillo (#264): columnas proporcionales con una (o varias) resaltadas en el acento
// y el resto en azul tenue. Para celdas KPI (ventas/día), barras·tiendas y columnas·hora.
// Presentacional: normaliza alturas sobre el máximo; el resaltado lo decide `accent`.
export type SparkBarsAccent = 'max' | 'last' | 'topN';

export interface SparkBarsProps {
  data: number[];
  /** Qué barra(s) van en acento: el máximo, la última, o las N más altas. Por defecto 'max'. */
  accent?: SparkBarsAccent;
  /** Nº de barras en acento cuando accent='topN'. */
  topN?: number;
  /** Intensidad (% de marca) de las barras atenuadas. Más bajo = más claro. Por defecto 28. */
  mutedPct?: number;
  height?: number;
  gap?: number;
}

export function SparkBars({
  data,
  accent = 'max',
  topN = 3,
  mutedPct = 28,
  height = 34,
  gap = 5,
}: SparkBarsProps) {
  const vals = data.filter((n) => Number.isFinite(n));
  if (vals.length === 0)
    return <span className="dv-sparkbars" style={{ height }} aria-hidden="true" />;
  const max = Math.max(...vals) || 1;

  const accentSet = new Set<number>();
  if (accent === 'max') accentSet.add(vals.indexOf(max));
  else if (accent === 'last') accentSet.add(vals.length - 1);
  else {
    [...vals.keys()]
      .sort((a, b) => vals[b]! - vals[a]!)
      .slice(0, Math.max(1, topN))
      .forEach((i) => accentSet.add(i));
  }
  const muted = rampMix(mutedPct);

  return (
    <span className="dv-sparkbars" style={{ height, gap }} aria-hidden="true">
      {vals.map((v, i) => (
        <span
          key={i}
          className="dv-sparkbars-bar"
          style={{
            height: `${Math.max((v / max) * 100, 4)}%`,
            background: accentSet.has(i) ? 'var(--ui-brand)' : muted,
          }}
        />
      ))}
    </span>
  );
}
