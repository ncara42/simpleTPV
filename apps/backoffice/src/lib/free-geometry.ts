// Geometría pura del lienzo libre (sin React ni DOM): proyecciones entre coordenadas de
// MUNDO (px del lienzo) y PANTALLA (px del viewport), usadas por la flecha de orientación
// off-screen y por el minimapa. screen = world·zoom + pan ⇒ world = (screen − pan)/zoom.

import type { FreeElement } from './dashboard-layout.js';

export interface View {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Caja envolvente (en mundo) de todos los elementos. null si no hay ninguno.
export function contentBounds(layout: readonly FreeElement[]): Bounds | null {
  if (layout.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of layout) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.w);
    maxY = Math.max(maxY, e.y + e.h);
  }
  return { minX, minY, maxX, maxY };
}

// ── Imán / snapping al arrastrar (lienzo libre) ──
// Rectángulo en coords de mundo (esquina sup-izq + tamaño).
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
// Guía visual: línea en un eje (`x` = vertical, `y` = horizontal) a la coordenada `pos`, que abarca
// de `start` a `end` en el eje perpendicular (todo en mundo).
export interface SnapGuide {
  axis: 'x' | 'y';
  pos: number;
  start: number;
  end: number;
}
export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

// Candidatos de ajuste de `moving` contra UN vecino `o` en un eje. Cada candidato es la posición de
// inicio (left/top) que tomaría `moving` y la coordenada de la guía a pintar (borde/centro compartido):
//  - alinear inicio/fin/centro (bordes alineados, sin separación);
//  - adyacencia con MARGEN `gap` a cada lado (pegado «imán» dejando exactamente ese hueco).
function axisCandidates(
  mStart: number,
  mSize: number,
  oStart: number,
  oSize: number,
  gap: number,
): Array<{ start: number; guide: number }> {
  const oEnd = oStart + oSize;
  return [
    { start: oStart, guide: oStart }, // alinear inicios
    { start: oEnd - mSize, guide: oEnd }, // alinear finales
    { start: oStart + oSize / 2 - mSize / 2, guide: oStart + oSize / 2 }, // alinear centros
    { start: oEnd + gap, guide: oEnd }, // pegar DESPUÉS del vecino (con margen)
    { start: oStart - gap - mSize, guide: oStart }, // pegar ANTES del vecino (con margen)
  ];
}

// Imán: ajusta la posición de `moving` para alinearse/pegarse a `others`, por eje INDEPENDIENTE
// (gana el candidato más cercano dentro de `threshold`, en px de MUNDO). Mantiene un margen `gap` al
// pegar adyacente. NO redimensiona nada. Devuelve la posición ajustada y las guías a pintar. Pura.
export function snapMovingRect(
  moving: Rect,
  others: readonly Rect[],
  gap: number,
  threshold: number,
): SnapResult {
  let best = {
    x: { dist: Infinity, start: moving.x, guide: 0, other: null as Rect | null },
    y: { dist: Infinity, start: moving.y, guide: 0, other: null as Rect | null },
  };
  for (const o of others) {
    for (const c of axisCandidates(moving.x, moving.w, o.x, o.w, gap)) {
      const d = Math.abs(moving.x - c.start);
      if (d < best.x.dist)
        best = { ...best, x: { dist: d, start: c.start, guide: c.guide, other: o } };
    }
    for (const c of axisCandidates(moving.y, moving.h, o.y, o.h, gap)) {
      const d = Math.abs(moving.y - c.start);
      if (d < best.y.dist)
        best = { ...best, y: { dist: d, start: c.start, guide: c.guide, other: o } };
    }
  }
  const snapX = best.x.dist <= threshold;
  const snapY = best.y.dist <= threshold;
  const x = snapX ? best.x.start : moving.x;
  const y = snapY ? best.y.start : moving.y;
  const guides: SnapGuide[] = [];
  if (snapX && best.x.other) {
    const o = best.x.other;
    guides.push({
      axis: 'x',
      pos: best.x.guide,
      start: Math.min(y, o.y),
      end: Math.max(y + moving.h, o.y + o.h),
    });
  }
  if (snapY && best.y.other) {
    const o = best.y.other;
    guides.push({
      axis: 'y',
      pos: best.y.guide,
      start: Math.min(x, o.x),
      end: Math.max(x + moving.w, o.x + o.w),
    });
  }
  return { x, y, guides };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type Edge = 'top' | 'right' | 'bottom' | 'left';

export interface OrientationArrow {
  /** Posición (px de pantalla) donde fijar la flecha, ya con margen aplicado. */
  x: number;
  y: number;
  /** Ángulo en grados al que rota la flecha (0 = apunta a la derecha). */
  angle: number;
  /** Margen contra el que queda pegada (el más dominante). */
  edge: Edge;
}

// Si el contenido NO es visible en el viewport, devuelve la flecha que apunta hacia él desde
// el borde correspondiente; si alguna parte del contenido se ve, devuelve null (no orientar).
export function offscreenArrow(
  bounds: Bounds | null,
  view: View,
  viewport: Size,
  margin = 28,
): OrientationArrow | null {
  if (!bounds) return null;
  const { panX, panY, zoom } = view;
  // Caja del contenido proyectada a pantalla.
  const left = bounds.minX * zoom + panX;
  const top = bounds.minY * zoom + panY;
  const right = bounds.maxX * zoom + panX;
  const bottom = bounds.maxY * zoom + panY;
  const visible = right > 0 && left < viewport.width && bottom > 0 && top < viewport.height;
  if (visible) return null;

  // Centro del contenido en pantalla y centro del viewport.
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const vcx = viewport.width / 2;
  const vcy = viewport.height / 2;
  const angle = (Math.atan2(cy - vcy, cx - vcx) * 180) / Math.PI;

  // Posición pegada al borde: se clampa el centro del contenido dentro del viewport.
  const x = clamp(cx, margin, viewport.width - margin);
  const y = clamp(cy, margin, viewport.height - margin);

  // Borde dominante: el eje por el que el contenido queda más fuera.
  const overTop = Math.max(0, -cy);
  const overBottom = Math.max(0, cy - viewport.height);
  const overLeft = Math.max(0, -cx);
  const overRight = Math.max(0, cx - viewport.width);
  const max = Math.max(overTop, overBottom, overLeft, overRight);
  let edge: Edge = 'top';
  if (max === overBottom) edge = 'bottom';
  if (max === overTop) edge = 'top';
  if (max === overRight) edge = 'right';
  if (max === overLeft) edge = 'left';

  return { x, y, angle, edge };
}

interface MiniRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MiniItem extends MiniRect {
  id: string;
  kind: FreeElement['kind'];
}

export interface MinimapProjection {
  items: MiniItem[];
  /** Rectángulo del viewport actual proyectado en el minimapa. */
  viewportRect: MiniRect;
  /** Escala mundo→minimapa y origen en mundo, para mapear clics de vuelta a mundo. */
  scale: number;
  worldMinX: number;
  worldMinY: number;
}

// Proyecta los elementos y el viewport actual a un minimapa de tamaño `mini`. La caja de
// referencia une el contenido con el viewport-en-mundo, de modo que el rectángulo del
// viewport siempre cabe aunque el usuario se haya alejado del contenido.
export function minimapProjection(
  layout: readonly FreeElement[],
  view: View,
  viewport: Size,
  mini: Size,
  padding = 40,
): MinimapProjection {
  const { panX, panY, zoom } = view;
  // Viewport expresado en coordenadas de mundo.
  const vx0 = (0 - panX) / zoom;
  const vy0 = (0 - panY) / zoom;
  const vx1 = (viewport.width - panX) / zoom;
  const vy1 = (viewport.height - panY) / zoom;

  const cb = contentBounds(layout);
  const minX = Math.min(vx0, cb ? cb.minX : vx0) - padding;
  const minY = Math.min(vy0, cb ? cb.minY : vy0) - padding;
  const maxX = Math.max(vx1, cb ? cb.maxX : vx1) + padding;
  const maxY = Math.max(vy1, cb ? cb.maxY : vy1) + padding;

  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const scale = Math.min(mini.width / worldW, mini.height / worldH);

  const items: MiniItem[] = layout.map((e) => ({
    id: e.id,
    kind: e.kind,
    x: (e.x - minX) * scale,
    y: (e.y - minY) * scale,
    w: e.w * scale,
    h: e.h * scale,
  }));

  const viewportRect: MiniRect = {
    x: (vx0 - minX) * scale,
    y: (vy0 - minY) * scale,
    w: (vx1 - vx0) * scale,
    h: (vy1 - vy0) * scale,
  };

  return { items, viewportRect, scale, worldMinX: minX, worldMinY: minY };
}

// Dado un clic en el minimapa (px relativos a su esquina), devuelve el `pan` que centra el
// viewport en ese punto del mundo, conservando el zoom.
export function minimapClickToPan(
  proj: MinimapProjection,
  miniX: number,
  miniY: number,
  view: View,
  viewport: Size,
): { panX: number; panY: number } {
  const worldX = proj.worldMinX + miniX / proj.scale;
  const worldY = proj.worldMinY + miniY / proj.scale;
  return {
    panX: viewport.width / 2 - worldX * view.zoom,
    panY: viewport.height / 2 - worldY * view.zoom,
  };
}
