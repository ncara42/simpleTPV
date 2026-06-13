// Helpers de data-viz compartidos por Chart/Sparkline (estilo "finance moderno":
// curvas suaves + ejes con pasos redondos). Puro cálculo, sin React ni DOM.

export type Point = readonly [x: number, y: number];

const f = (n: number): string => n.toFixed(2);

/**
 * Devuelve el `d` de un `<path>` que une los puntos con una curva cúbica monótona
 * (Fritsch–Carlson): suave pero SIN sobrepasar los datos (no inventa picos ni
 * valles entre puntos). Espera `x` estrictamente creciente.
 *
 * Con 0 puntos devuelve cadena vacía; con 1, un `M`; con 2, una recta `L`.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${f(points[0]![0])},${f(points[0]![1])}`;
  if (n === 2) {
    return `M ${f(points[0]![0])},${f(points[0]![1])} L ${f(points[1]![0])},${f(points[1]![1])}`;
  }

  const dx: number[] = [];
  const slope: number[] = []; // pendiente de cada secante
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1]![0] - points[i]![0];
    dx.push(h);
    slope.push(h === 0 ? 0 : (points[i + 1]![1] - points[i]![1]) / h);
  }

  // Tangente en cada punto (media armónica ponderada en interiores).
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0]!;
  tangent[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const sPrev = slope[i - 1]!;
    const sNext = slope[i]!;
    if (sPrev * sNext <= 0) {
      tangent[i] = 0; // extremo local → tangente plana, evita overshoot
    } else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      tangent[i] = (w1 + w2) / (w1 / sPrev + w2 / sNext);
    }
  }

  let d = `M ${f(points[0]![0])},${f(points[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const h = (x1 - x0) / 3;
    const c1x = x0 + h;
    const c1y = y0 + h * tangent[i]!;
    const c2x = x1 - h;
    const c2y = y1 - h * tangent[i + 1]!;
    d += ` C ${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Redondea `v` hacia arriba a 1/2/2.5/5 × 10ⁿ (escala "bonita" para ejes). */
function niceStep(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const frac = v / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return nice * base;
}

export interface AxisTicks {
  /** Tope del eje (≥ max); úsalo como denominador al escalar barras/líneas. */
  top: number;
  /** Valores de cada línea de referencia, de 0 al tope. */
  ticks: number[];
}

/**
 * Calcula ~`count` marcas con pasos redondos para un eje 0..max. El `top` puede
 * superar `max` para dejar aire por encima del dato más alto (look de cuadro de
 * mando financiero). Con `max <= 0` degrada a un único tramo 0..1.
 */
export function niceTicks(max: number, count = 4): AxisTicks {
  if (!Number.isFinite(max) || max <= 0) return { top: 1, ticks: [0, 1] };
  const step = niceStep(max / count);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { top, ticks };
}
