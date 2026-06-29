// Sparkline de área (línea + relleno suave) para incrustar al pie de una celda KPI (#264). A
// diferencia de MiniSparkline (que envuelve <Sparkline>), va a sangre: ocupa todo el ancho de la
// celda y se ancla abajo. Presentacional: recibe la serie numérica y un tono semántico.

export type SparkAreaTone = 'accent' | 'danger' | 'neutral';

export interface SparkAreaProps {
  data: number[];
  tone?: SparkAreaTone;
  /** Alto del trazo (px si es número; CSS si es string, p. ej. "100%" para llenar el contenedor). */
  height?: number | string;
}

const TONE_STROKE: Record<SparkAreaTone, string> = {
  accent: 'var(--ui-brand)',
  danger: 'var(--ui-danger)',
  neutral: 'var(--gst-400, #a1a1aa)',
};
// Relleno tenue bajo la línea; el gris no rellena (la línea sola basta para una serie de contexto).
const TONE_FILL: Record<SparkAreaTone, string> = {
  accent: 'color-mix(in srgb, var(--ui-brand) 8%, transparent)',
  danger: 'color-mix(in srgb, var(--ui-danger) 7%, transparent)',
  neutral: 'transparent',
};

const VB_W = 240;
const VB_H = 44;
const PAD_TOP = 6; // holgura para que el pico no toque el filo superior
const PAD_BOT = 6;

export function SparkArea({ data, tone = 'accent', height = 42 }: SparkAreaProps) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2)
    return <span className="dv-spark-area" style={{ height }} aria-hidden="true" />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const usableH = VB_H - PAD_TOP - PAD_BOT;
  const x = (i: number): number => (i / (pts.length - 1)) * VB_W;
  const y = (v: number): number => PAD_TOP + (1 - (v - min) / span) * usableH;

  const line = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${VB_W},${VB_H} L0,${VB_H} Z`;

  return (
    <span className="dv-spark-area" style={{ height }} aria-hidden="true">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" width="100%" height="100%">
        <path d={area} fill={TONE_FILL[tone]} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
