// Animación de ENTRADA de los bloques recién añadidos al tablero (a mano por el usuario o por el
// agente): un rebote escalonado en TANDAS (p. ej. de 2 en 2 → dos entran a la vez, luego las
// siguientes, etc.). La usan FreeBoard y GridBoard.
//
// Detección «de verdad nuevo»: se diffea el conjunto de ids entre renders. En el PRIMER render
// (montaje: carga inicial o cambio de modo, donde el board se re-monta) solo se registran los ids,
// SIN animar — así el cambio de modo (que ya tiene su propio morph) no dispara rebotes. Solo cuando
// el conjunto CRECE estando ya montado se anima a los nuevos.
//
// El `scale` del rebote va con `composite: 'add'` (Web Animations API): se COMPONE con el `transform:
// translate(x,y)` de mundo que el lienzo pone inline en cada item, en vez de pisarlo. `fill:
// 'backwards'` mantiene el bloque pequeño e invisible durante su retardo de tanda (sin parpadeo) y al
// terminar lo suelta a su estado natural (idéntico al que pinta React). En cuadrícula no hay transform
// inline, así que el composite simplemente aplica el scale.

import { useLayoutEffect, useRef } from 'react';

import { prefersReducedMotion } from './mode-transition.js';

const DURATION = 460; // ms del rebote de cada bloque
const BATCH_SIZE = 2; // cuántos bloques entran a la vez (tanda)
const BATCH_STEP = 95; // ms entre tandas
const EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // back-out: rebote con sobre-impulso

// Rebote: aparece pequeño, se pasa de tamaño (overshoot), corrige por debajo y asienta. El back-out
// del easing añade el muelle; los keyframes fijan la amplitud.
const POP_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.42)', offset: 0 },
  { transform: 'scale(1.06)', offset: 0.62 },
  { transform: 'scale(0.97)', offset: 0.82 },
  { transform: 'scale(1)', offset: 1 },
];
const FADE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, offset: 0 },
  { opacity: 1, offset: 0.45 },
  { opacity: 1, offset: 1 },
];

/**
 * Anima la entrada (rebote en tandas) de los bloques cuyo id aparece por primera vez.
 * @param ids ids de los bloques renderizados AHORA, en orden de render.
 * @param getContainer devuelve el contenedor donde buscar los nodos `[data-board-item]`.
 */
export function useEnterAnimation(ids: string[], getContainer: () => HTMLElement | null): void {
  const prevRef = useRef<Set<string> | null>(null);
  // Clave estable por CONJUNTO (no por orden): así un re-orden (traer al frente) no dispara el efecto;
  // solo lo hace un alta/baja real.
  const key = [...new Set(ids)].sort().join('|');

  useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = new Set(ids);
    // Montaje (carga inicial / cambio de modo) o reduce-motion: registrar y no animar.
    if (prev === null || prefersReducedMotion()) return;
    const added = ids.filter((id) => !prev.has(id));
    if (added.length === 0) return;
    const container = getContainer();
    if (!container) return;

    added.forEach((id, i) => {
      const node = container.querySelector<HTMLElement>(`[data-board-item="${CSS.escape(id)}"]`);
      if (!node) return;
      const delay = Math.floor(i / BATCH_SIZE) * BATCH_STEP;
      const timing: KeyframeAnimationOptions = {
        duration: DURATION,
        delay,
        easing: EASE,
        fill: 'backwards',
      };
      // Scale compuesto con el translate de mundo; opacidad por separado (composite por defecto).
      node.animate(POP_KEYFRAMES, { ...timing, composite: 'add' });
      node.animate(FADE_KEYFRAMES, timing);
    });
    // El efecto se dispara al cambiar el CONJUNTO de ids; lee `ids` (orden) del render actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
