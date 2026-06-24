// Orquesta la transición fluida entre los modos del dashboard (cuadrícula ↔ lienzo libre). Mantiene
// AMBOS boards montados durante el cambio para poder medir origen y destino, oculta el contenido real
// y deja que vuelen SKELETONS de carga (ver mode-transition). Coordina además la «ola» de puntos del
// lienzo. El cambio de modo lo dispara el toggle (escribe `layout.mode` en el store); aquí se observa
// ese `target` y se desacopla del render con un `committed` que va por detrás durante la animación.
//
// Por qué skeletons: clonar el contenido real (charts SVG) y escalarlo a tamaño de card en tiempo real
// distorsiona y da tirones. El skeleton es una caja lisa: vuela igual de bien pero sin coste. Cuando
// todo está quieto, se desvanece y revela el contenido real ya renderizado debajo (crossfade).
//
// Máquina de estados (dos efectos de layout, ambos pre-paint → sin parpadeos):
//   A) `target` cambió → con el modo viejo aún montado, captura los rects de ORIGEN, conmuta.
//   B) ambos montados → crea los skeletons de origen (tapan el contenido ya oculto antes del primer
//      paint), y en el siguiente frame mide el destino asentado, vuela los skeletons escalonados en
//      ola desde el toggle + la ola de puntos; al aterrizar revela el contenido real y los funde.

import { useLayoutEffect, useRef, useState } from 'react';

import {
  animateFadeIn,
  animateFadeOut,
  animateSettleOut,
  animateSkeletonMove,
  buildSkeleton,
  captureBoardItems,
  type CapturedItem,
  type Mode,
  prefersReducedMotion,
  type Rect,
  rectCenter,
  skeletonStyle,
} from './mode-transition.js';

const DURATION = 420; // ms del recorrido de cada bloque
const STAGGER_MAX = 110; // ms de desfase máximo entre el bloque más cercano y el más lejano al origen
const APPEAR_LAG = 60; // ms extra para los bloques que solo existen en el destino (entran tras la ola)
const SETTLE_MS = 150; // ms del crossfade skeleton→real al asentarse
const EASE_MOVE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // glide con asentamiento suave
const EASE_FADE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SAFETY_MS = DURATION + STAGGER_MAX + SETTLE_MS + 400; // red de seguridad si `finished` no resuelve

interface PendingFrom {
  from: Mode;
  // Bloques de origen con su nodo real: el skeleton copia de él el radio/fondo de la superficie.
  origins: Map<string, CapturedItem>;
}

export interface ModeTransition {
  /** Modo actualmente «real» para el render (va por detrás de `target` durante la animación). */
  committed: Mode;
  /** Modo saliente que sigue montado mientras dura el morph (o `null` en reposo). */
  outgoing: Mode | null;
  sectionRef: React.RefObject<HTMLElement | null>;
  ghostLayerRef: React.RefObject<HTMLDivElement | null>;
  /** Clase del host de un board (incoming/outgoing) para z-index y ocultado del saliente. */
  hostClass: (mode: Mode) => string;
}

// Punto de emanación de la ola: el centro del toggle de modo (el control que se acaba de pulsar), en
// coordenadas de viewport. Si no se encuentra, el centro de la sección.
function waveOrigin(section: HTMLElement): { x: number; y: number } {
  const target = document.querySelector('[data-testid="dashboard-mode-toggle"]') ?? section;
  const r = target.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function useModeTransition(target: Mode): ModeTransition {
  const sectionRef = useRef<HTMLElement | null>(null);
  const ghostLayerRef = useRef<HTMLDivElement | null>(null);
  const [committed, setCommitted] = useState<Mode>(target);
  const [outgoing, setOutgoing] = useState<Mode | null>(null);
  const animatingRef = useRef(false);
  const pendingRef = useRef<PendingFrom | null>(null);
  // Cancelador de una animación en curso (toggles rápidos): aborta limpio antes de empezar otra.
  const abortRef = useRef<(() => void) | null>(null);

  // A) target cambió → captura los rects de ORIGEN con el modo viejo aún vigente, luego conmuta.
  useLayoutEffect(() => {
    if (target === committed) return;
    const section = sectionRef.current;
    const ghostLayer = ghostLayerRef.current;
    const host = section?.querySelector<HTMLElement>(`[data-board-host="${committed}"]`) ?? null;

    // Sin animación (reduced-motion) o sin DOM medible: swap directo.
    if (prefersReducedMotion() || !section || !ghostLayer || !host) {
      abortRef.current?.();
      setCommitted(target);
      setOutgoing(null);
      return;
    }
    abortRef.current?.(); // cancela un morph anterior aún vivo
    // Conserva el NODO real de cada bloque (no solo el rect): el skeleton copiará de él el radio/fondo
    // de la superficie. El nodo es del board SALIENTE, que sigue montado durante el morph → válido.
    const origins = new Map(captureBoardItems(host));
    pendingRef.current = { from: committed, origins };
    animatingRef.current = true;
    setOutgoing(committed);
    setCommitted(target);
    // Solo reacciona al cambio de `target`; `committed` se actualiza aquí dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // B) ambos montados → ejecuta el morph.
  useLayoutEffect(() => {
    if (outgoing === null || !animatingRef.current) return;
    const section = sectionRef.current;
    const ghostLayer = ghostLayerRef.current;
    const pending = pendingRef.current;
    if (!section || !ghostLayer || !pending) {
      animatingRef.current = false;
      setOutgoing(null);
      return;
    }

    const incoming = committed;
    const incomingHost = section.querySelector<HTMLElement>(`[data-board-host="${incoming}"]`);
    const dots = section.querySelector<HTMLElement>('.dash-free-dots');
    const origin = waveOrigin(section);

    // Crea los skeletons de ORIGEN y oculta el contenido real (vía .dash--morphing): los skeletons
    // tapan las posiciones viejas antes del primer paint → continuidad total. Caja lisa, coste mínimo.
    section.classList.add('dash--morphing');
    // Construye TODOS los skeletons de origen (lecturas de getComputedStyle) y luego los inserta de una
    // vez vía DocumentFragment: evita intercalar lectura+escritura, que forzaría un reflow por bloque.
    const originSkels = new Map<string, { rect: Rect; el: HTMLElement }>();
    const originFrag = document.createDocumentFragment();
    for (const [id, item] of pending.origins) {
      const el = buildSkeleton(item.rect, item.node);
      originFrag.appendChild(el);
      originSkels.set(id, { rect: item.rect, el });
    }
    ghostLayer.appendChild(originFrag);
    // Si el lienzo ENTRA, «arma» sus puntos a oculto ANTES del primer paint para que no destellen
    // llenos un frame antes de que arranque la ola (la animación parte de --dots-reveal:0).
    if (dots && incoming === 'free') dots.style.setProperty('--dots-reveal', '0');

    let cancelled = false;
    const anims: Animation[] = [];
    let rafId = 0;
    let safety = 0;

    const cleanupVisuals = (): void => {
      ghostLayer.replaceChildren();
      section.classList.remove('dash--morphing');
      dots?.classList.remove('dash-free-dots--reveal', 'dash-free-dots--conceal');
      dots?.style.removeProperty('--dots-origin');
      dots?.style.removeProperty('--dots-reveal');
    };
    const finish = (): void => {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(safety);
      cleanupVisuals();
      pendingRef.current = null;
      animatingRef.current = false;
      abortRef.current = null;
      setOutgoing(null);
    };
    abortRef.current = (): void => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(safety);
      for (const a of anims) a.cancel();
      cleanupVisuals();
      pendingRef.current = null;
      animatingRef.current = false;
    };

    // Al aterrizar: revela el contenido real (ya en su sitio, tapado por los skeletons) y funde los
    // skeletons que tienen destino → crossfade skeleton→real. Los sin destino ya se desvanecieron.
    const settle = (settleSkels: HTMLElement[]): void => {
      if (cancelled) return;
      section.classList.remove('dash--morphing');
      if (settleSkels.length === 0) {
        finish();
        return;
      }
      const fades = settleSkels.map((s) => animateSettleOut(s, SETTLE_MS));
      anims.push(...fades);
      void Promise.allSettled(fades.map((a) => a.finished)).then(finish);
    };

    rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const lastMap = captureBoardItems(incomingHost);

      const distOf = (r: Rect): number => {
        const c = rectCenter(r);
        return Math.hypot(c.x - origin.x, c.y - origin.y);
      };
      const maxDist = Math.max(
        1,
        ...[...originSkels.values()].map((o) => distOf(o.rect)),
        ...[...lastMap.values()].map((c) => distOf(c.rect)),
      );
      const delayFor = (r: Rect): number => (distOf(r) / maxDist) * STAGGER_MAX;

      const settleSkels: HTMLElement[] = [];
      // Animaciones diferidas: se hacen primero TODAS las lecturas (getComputedStyle) y la escritura del
      // DOM una sola vez (fragment), y solo entonces arrancan → 1 reflow en vez de N.
      const starts: Array<() => Animation> = [];

      // Skeletons de origen: vuelan a su destino (magic move, con radio EN PANTALLA interpolado para
      // casar con la card a cada zoom) o se desvanecen si ya no existen en el modo nuevo.
      for (const [id, o] of originSkels) {
        const last = lastMap.get(id);
        const delay = delayFor(o.rect);
        if (last) {
          const fromRadius = o.el.style.borderRadius; // radio en pantalla del origen (lo puso buildSkeleton)
          const toRadius = skeletonStyle(last.node, last.rect).radius; // radio en pantalla del destino
          const radii = fromRadius && toRadius ? { from: fromRadius, to: toRadius } : undefined;
          starts.push(() =>
            animateSkeletonMove(
              o.el,
              o.rect,
              last.rect,
              { duration: DURATION, delay, easing: EASE_MOVE },
              radii,
            ),
          );
          settleSkels.push(o.el);
        } else {
          starts.push(() =>
            animateFadeOut(o.el, o.rect, { duration: DURATION * 0.8, delay, easing: EASE_FADE }),
          );
        }
      }
      // Bloques que solo existen en el destino: se construyen (lecturas) en un fragment y se insertan de
      // una sola vez; su fade-in se difiere igual que el resto.
      const appearFrag = document.createDocumentFragment();
      for (const [id, c] of lastMap) {
        if (originSkels.has(id)) continue;
        const el = buildSkeleton(c.rect, c.node);
        appearFrag.appendChild(el);
        settleSkels.push(el);
        starts.push(() =>
          animateFadeIn(el, c.rect, {
            duration: DURATION * 0.7,
            delay: delayFor(c.rect) + APPEAR_LAG,
            easing: EASE_FADE,
          }),
        );
      }

      // Ola de puntos: revelar si el lienzo ENTRA, ocultar si SALE. El origen relativo a la capa de
      // puntos alimenta el `radial-gradient` de la máscara y el transform-origin del rebote.
      if (dots) {
        const dr = dots.getBoundingClientRect();
        dots.style.setProperty('--dots-origin', `${origin.x - dr.left}px ${origin.y - dr.top}px`);
        dots.classList.add(
          incoming === 'free' ? 'dash-free-dots--reveal' : 'dash-free-dots--conceal',
        );
      }

      ghostLayer.appendChild(appearFrag); // única escritura al DOM vivo de la tanda
      for (const start of starts) anims.push(start()); // ahora sí, arrancan las animaciones

      const flying = anims.slice();
      if (flying.length === 0) {
        // Boards vacíos: nada que volar; deja respirar a la ola de puntos y cierra antes.
        window.clearTimeout(safety);
        safety = window.setTimeout(finish, DURATION);
        return;
      }
      void Promise.allSettled(flying.map((a) => a.finished)).then(() => {
        if (!cancelled) settle(settleSkels);
      });
    });

    safety = window.setTimeout(finish, SAFETY_MS);
    return () => window.clearTimeout(safety);
  }, [committed, outgoing]);

  const hostClass = (mode: Mode): string => {
    const role = mode === committed ? ' is-incoming' : mode === outgoing ? ' is-outgoing' : '';
    return `dash-board-host${role}`;
  };

  return { committed, outgoing, sectionRef, ghostLayerRef, hostClass };
}
