// Rampa monocroma azul de data-viz (#264). El diseño Geist usa UN solo acento (azul de marca) en
// una escala descendente — nunca arcoíris. En vez de literales (#2f8cf6, #83bdfa…) que romperían el
// modo oscuro, derivamos cada paso mezclando el token de marca con la superficie vía color-mix: en
// claro la mezcla aclara hacia blanco; en oscuro oscurece hacia la tarjeta → la rampa se adapta sola.

// Mezcla `pct`% de --ui-brand con la superficie. pct=100 → marca pura; pct↓ → más tenue.
export function rampMix(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `color-mix(in srgb, var(--ui-brand) ${p}%, var(--ui-surface))`;
}

// Programa de intensidades para una serie categórica (treemap, donut, barra apilada): el 1.º a
// marca plena y el resto en descenso suave. Reproduce la escala del diseño (100/78/60/40/26/14…).
const CATEGORICAL_STEPS = [100, 78, 60, 42, 30, 20, 14, 10] as const;

// Intensidad (% de marca) del segmento i en la rampa categórica.
export function rampPct(index: number): number {
  return CATEGORICAL_STEPS[index] ?? Math.max(8, 14 - (index - CATEGORICAL_STEPS.length) * 3);
}

// Color del segmento i en la rampa categórica.
export function rampColor(index: number): string {
  return rampMix(rampPct(index));
}

// Intensidad (0..1) → color de celda de heatmap. Suelo en 12% para que el valor mínimo siga
// distinguiéndose del fondo (no una celda en blanco), techo en marca plena.
export function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  return rampMix(12 + t * 88);
}

// ¿Texto claro o tinta sobre una superficie de la rampa a `pct`% de marca? Por encima del umbral la
// celda es lo bastante saturada para texto blanco; por debajo usa la tinta azul oscura (--dv-tile-ink).
export function rampInk(pct: number): string {
  return pct >= 46 ? '#ffffff' : 'var(--dv-tile-ink)';
}
