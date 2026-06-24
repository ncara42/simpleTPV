// Transición «magic move» entre los dos modos del dashboard (cuadrícula ↔ lienzo libre). En vez de
// un swap duro, cada bloque VUELA de su posición de origen a su destino mediante un SKELETON: una caja
// de carga ligerísima (sin contenido real) que se anima con la Web Animations API. Cuando todo está
// quieto, el skeleton se desvanece y aparece el contenido real (crossfade skeleton→real).
//
// Por qué skeletons y no clones del contenido: clonar el DOM real (los charts son SVG pesados) y
// escalarlo a tamaño de card EN TIEMPO REAL distorsiona el diseño y bloquea el hilo principal al
// arrancar (tirones). El skeleton es un `<div>` sin hijos y copia el radio/fondo reales de la card.
//
// Tamaño SIN distorsión de esquinas: el vuelo NO usa `transform: scale` (que estira el border-radius a
// una elipse — MDN). Mueve la posición con `translate` (compositor) y re-dimensiona con width/height
// (redimensionado real → la esquina nunca se estira — el modo «corner-safe» que recomienda GSAP). El
// radio EN PANTALLA difiere entre rejilla (z=1) y lienzo (z=zoom), así que se interpola entre los radios
// reales de ambos extremos para casar con la card (arco circular en cada frame, sin distorsión). El
// coste de layout es trivial: el skeleton es `position: fixed` (fuera de flujo) y vacío, acotado por
// `contain: layout paint`.
//
// El orquestador (use-mode-transition) captura los rects de ORIGEN con el modo viejo aún montado,
// conmuta, mide los de DESTINO ya asentados y vuela los skeletons entre ambos; al terminar revela el
// contenido real por debajo.

export type Mode = 'grid' | 'free';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CapturedItem {
  id: string;
  rect: Rect;
  node: HTMLElement;
}

export interface FlipOptions {
  duration: number;
  delay: number;
  easing: string;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export const rectCenter = (r: Rect): { x: number; y: number } => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
});

// Mapa id→{rect,node} de todos los bloques de un host (los marcados con `data-board-item`). Los
// elementos colapsados (0×0) se ignoran: no tienen posición que animar.
export function captureBoardItems(host: HTMLElement | null): Map<string, CapturedItem> {
  const map = new Map<string, CapturedItem>();
  if (!host) return map;
  for (const node of host.querySelectorAll<HTMLElement>('[data-board-item]')) {
    const id = node.dataset.boardItem;
    if (!id) continue;
    const rect = rectOf(node);
    if (rect.w === 0 && rect.h === 0) continue;
    map.set(id, { id, rect, node });
  }
  return map;
}

// Superficies redondeadas reales dentro de un bloque cuando el wrapper es transparente: cards/paneles/
// notas y las piezas de los widgets del agente (dataviz/genéricos).
const SURFACE_SEL =
  '.dash-card, .dash-panel, .dash-free-item--note, .dash-generic--insight, .dv-panel, .dv-chart, .dv-grid, .dv-kpi-tile';
// Anotaciones a mano (sin superficie de card): el skeleton no debe fingir una caja redondeada.
const NON_SURFACE = '.dash-free-item--shape, .dash-free-item--draw, .dash-free-item--text';
const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
const FALLBACK_RADIUS_PX = 18; // último recurso si no se resuelve --ui-radius-lg

const firstRadiusPx = (value: string): number => {
  const n = Number.parseFloat(value); // '18px' | '18px 18px …' → 18 ; '' → NaN
  return Number.isFinite(n) ? n : 0;
};
const opaqueBg = (c: string): string | null => (TRANSPARENT.has(c) ? null : c);

export interface SkeletonStyle {
  /** Radio EN PANTALLA (px), ya escalado por el zoom del lienzo; '' si no hay superficie. */
  radius: string;
  background: string | null;
  /** false para anotaciones a mano (shape/draw/text): el skeleton va transparente, sin fingir card. */
  surface: boolean;
}

// Resuelve el aspecto del skeleton para que coincida EXACTAMENTE con la card real, EN PANTALLA. Clave:
// en el lienzo el bloque se pinta dentro de `.dash-free-world` con `scale(zoom)`, así que su radio en
// pantalla es `radioLayout × zoom`. `getComputedStyle` da el radio PRE-transform, por eso se multiplica
// por la escala real medida del DOM = anchoEnPantalla(rect) / anchoLayout(offsetWidth). En cuadrícula
// (sin scale) la escala es 1. El radio se busca en el propio nodo, luego en su superficie interior, y
// como último recurso en el token unificado `--ui-radius-lg` (así los widgets del agente nunca vuelan
// cuadrados). Sin inventar: todo sale de estilos computados reales.
export function skeletonStyle(node: HTMLElement, rect: Rect): SkeletonStyle {
  if (node.matches(NON_SURFACE)) return { radius: '', background: null, surface: false };
  const scale = node.offsetWidth > 0 ? rect.w / node.offsetWidth : 1;
  const own = getComputedStyle(node);
  let radiusPx = firstRadiusPx(own.borderRadius);
  let bg = opaqueBg(own.backgroundColor);
  if (radiusPx === 0 || bg === null) {
    const surf = node.querySelector<HTMLElement>(SURFACE_SEL);
    if (surf) {
      const scs = getComputedStyle(surf);
      if (radiusPx === 0) radiusPx = firstRadiusPx(scs.borderRadius);
      if (bg === null) bg = opaqueBg(scs.backgroundColor);
    }
  }
  if (radiusPx === 0) {
    radiusPx = firstRadiusPx(own.getPropertyValue('--ui-radius-lg')) || FALLBACK_RADIUS_PX;
  }
  return { radius: `${Math.round(radiusPx * scale * 100) / 100}px`, background: bg, surface: true };
}

// Crea un skeleton de carga dimensionado y colocado en `rect` (viewport, fixed, origen sup-izq). Si se
// pasa `source`, COPIA su radio (en pantalla) y fondo reales: así no cambia el diseño de la card (mismo
// border-radius en cada extremo; las notas vuelan amarillas; los widgets del agente, redondeados). El
// brillo de carga lo da el CSS de `.dash-mode-skeleton`.
export function buildSkeleton(rect: Rect, source?: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dash-mode-skeleton';
  el.setAttribute('aria-hidden', 'true');
  const s = el.style;
  s.position = 'fixed';
  s.left = '0';
  s.top = '0';
  s.width = `${rect.w}px`;
  s.height = `${rect.h}px`;
  s.transformOrigin = 'top left';
  s.transform = `translate(${rect.x}px, ${rect.y}px)`;
  s.pointerEvents = 'none';
  if (source) {
    const { radius, background, surface } = skeletonStyle(source, rect);
    if (!surface) {
      // Anotación a mano: placeholder invisible (no finge una superficie redondeada que no existe).
      s.background = 'transparent';
      s.border = 'none';
    } else {
      if (radius) s.borderRadius = radius;
      if (background) s.background = background;
    }
  }
  return el;
}

// «Magic move»: un único skeleton se desliza (translate, compositor) y RE-DIMENSIONA vía width/height
// — NO `transform: scale` — del ORIGEN al DESTINO. Al ser un redimensionado real (no un estirado), la
// esquina NUNCA se estira a una elipse (MDN / GSAP). El radio EN PANTALLA sí difiere entre rejilla
// (z=1) y lienzo (z=zoom), así que se interpola de `radii.from` a `radii.to` para casar con la card
// real en AMBOS extremos (cada frame es un arco circular, no una distorsión). El coste de layout queda
// acotado por `contain: layout paint` en `.dash-mode-skeleton` (caja `fixed` y vacía → no reflota a nadie).
export function animateSkeletonMove(
  skeleton: HTMLElement,
  from: Rect,
  to: Rect,
  opt: FlipOptions,
  radii?: { from: string; to: string },
): Animation {
  const k0: Keyframe = {
    transform: `translate(${from.x}px, ${from.y}px)`,
    width: `${from.w}px`,
    height: `${from.h}px`,
  };
  const k1: Keyframe = {
    transform: `translate(${to.x}px, ${to.y}px)`,
    width: `${to.w}px`,
    height: `${to.h}px`,
  };
  if (radii && radii.from && radii.to) {
    k0.borderRadius = radii.from;
    k1.borderRadius = radii.to;
  }
  return skeleton.animate([k0, k1], {
    duration: opt.duration,
    delay: opt.delay,
    easing: opt.easing,
    fill: 'both',
  });
}

// Bloque que solo existe en el DESTINO (p. ej. formas/texto al volver al lienzo): el skeleton emerge
// con un leve empuje hacia arriba. Solo opacity + translate (sin scale) → el radio nunca cambia.
export function animateFadeIn(skeleton: HTMLElement, rect: Rect, opt: FlipOptions): Animation {
  return skeleton.animate(
    [
      { transform: `translate(${rect.x}px, ${rect.y + 14}px)`, opacity: 0 },
      { transform: `translate(${rect.x}px, ${rect.y}px)`, opacity: 1 },
    ],
    { duration: opt.duration, delay: opt.delay, easing: opt.easing, fill: 'both' },
  );
}

// Bloque que solo existe en el ORIGEN (p. ej. formas/texto al pasar a cuadrícula): el skeleton se
// desvanece con un leve descenso. Solo opacity + translate (sin scale) → el radio nunca cambia.
export function animateFadeOut(skeleton: HTMLElement, rect: Rect, opt: FlipOptions): Animation {
  return skeleton.animate(
    [
      { transform: `translate(${rect.x}px, ${rect.y}px)`, opacity: 1 },
      { transform: `translate(${rect.x}px, ${rect.y + 8}px)`, opacity: 0 },
    ],
    { duration: opt.duration, delay: opt.delay, easing: opt.easing, fill: 'both' },
  );
}

// Desvanecido del skeleton al ASENTARSE (crossfade hacia el contenido real, ya visible debajo).
export function animateSettleOut(skeleton: HTMLElement, duration: number): Animation {
  return skeleton.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: 'ease',
    fill: 'both',
  });
}
