import { WidgetStates } from './atoms.js';

// Área acumulada con proyección (#264): serie ACTUAL (área + línea azul, parcial), serie de
// COMPARACIÓN (línea gris, mes anterior completo) y PROYECCIÓN (tramo discontinuo desde el último
// punto real hasta el fin de mes estimado). Mono: azul = ahora, gris = comparación. Presentacional.
export interface ProjectionAreaProps {
  /** Serie acumulada actual (parcial: los días transcurridos). */
  actual: number[];
  /** Serie acumulada de comparación (mes anterior, span completo). */
  compare?: number[];
  /** Valor proyectado a fin de periodo (traza discontinua hasta el borde derecho). */
  projectionEnd?: number;
  /** Nº de puntos del eje temporal (días del mes). Por defecto, el largo de `compare` o `actual`. */
  totalPoints?: number;
  height?: number;
  isLoading?: boolean;
  isError?: boolean;
}

const VB = 100;
const GRID = [14, 38.5, 62, 85.5]; // líneas de referencia (% del alto)

export function ProjectionArea({
  actual,
  compare,
  projectionEnd,
  totalPoints,
  height = 240,
  isLoading = false,
  isError = false,
}: ProjectionAreaProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const act = (actual ?? []).filter((n) => Number.isFinite(n));
  if (act.length < 2) return <WidgetStates state="empty" />;
  const cmp = (compare ?? []).filter((n) => Number.isFinite(n));

  const n = Math.max(totalPoints ?? cmp.length ?? act.length, act.length);
  const max =
    Math.max(...act, ...(cmp.length ? cmp : [0]), projectionEnd ?? Number.NEGATIVE_INFINITY) || 1;
  const y = (v: number): number => (1 - v / max) * VB;
  const xActual = (i: number): number => (i / (n - 1)) * VB;
  const xCompare = (j: number): number => (cmp.length > 1 ? (j / (cmp.length - 1)) * VB : 0);

  const actualPts = act.map((v, i) => `${xActual(i).toFixed(1)},${y(v).toFixed(1)}`);
  const actualLine = `M${actualPts.join(' L')}`;
  const actualArea = `${actualLine} L${xActual(act.length - 1).toFixed(1)},${VB} L0,${VB} Z`;
  const comparePath =
    cmp.length > 1
      ? `M${cmp.map((v, j) => `${xCompare(j).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`
      : '';

  const lastX = xActual(act.length - 1);
  const lastY = y(act[act.length - 1]!);
  const projPath =
    projectionEnd != null
      ? `M${lastX.toFixed(1)},${lastY.toFixed(1)} L${VB},${y(projectionEnd).toFixed(1)}`
      : '';

  return (
    <div className="dv-projarea" style={{ height }}>
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="none"
        className="dv-projarea-svg"
        role="img"
        aria-label="Acumulado con proyección"
      >
        <defs>
          <linearGradient id="dv-proj-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ui-brand)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--ui-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {GRID.map((g) => (
          <line key={g} x1="0" y1={g} x2={VB} y2={g} className="dv-projarea-grid" />
        ))}
        {comparePath ? (
          <path d={comparePath} className="dv-projarea-compare" vectorEffect="non-scaling-stroke" />
        ) : null}
        <path d={actualArea} fill="url(#dv-proj-grad)" />
        <path d={actualLine} className="dv-projarea-line" vectorEffect="non-scaling-stroke" />
        {projPath ? (
          <path d={projPath} className="dv-projarea-proj" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
    </div>
  );
}
