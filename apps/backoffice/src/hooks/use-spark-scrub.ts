import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';

// Píxeles de arrastre horizontal por cada ventana retrocedida (tacto "una sacudida = un paso").
const STEP_PX = 46;

export interface SparkScrub {
  /** Ventanas hacia atrás respecto al periodo en vivo (0 = ahora). */
  offset: number;
  /** Hay un arrastre en curso (para pintar feedback). */
  dragging: boolean;
  reset: () => void;
  stepBack: () => void;
  stepForward: () => void;
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
  };
}

/**
 * Gesto de "scrub temporal" sobre una card de KPI: arrastrar a la IZQUIERDA retrocede en el tiempo,
 * a la derecha avanza, sin pasar de la ventana actual (offset 0) ni de `maxBack`.
 *
 * Toma posesión del puntero (`setPointerCapture` + `stopPropagation` en pointerdown) para que el
 * tablero arrastrable (FreeBoard) no secuestre el gesto y mueva el widget entero. El botón de
 * reinicio se marca con `data-spark-reset` para que su click no inicie un scrub.
 */
export function useSparkScrub(maxBack: number): SparkScrub {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; base: number } | null>(null);

  const clamp = (n: number): number => Math.max(0, Math.min(maxBack, n));

  const onPointerDown = (e: ReactPointerEvent): void => {
    // El botón de reinicio gestiona su propio click; no arranques un arrastre desde él.
    if ((e.target as HTMLElement).closest('[data-spark-reset]')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); // no dejes que el tablero inicie su drag de widget
    drag.current = { x: e.clientX, base: offset };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture puede fallar si el puntero ya se soltó; el gesto degrada sin captura.
    }
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x; // izquierda → dx < 0 → atrás en el tiempo
    setOffset(clamp(d.base + Math.round(-dx / STEP_PX)));
  };

  const end = (e: ReactPointerEvent): void => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // idem: liberar puede fallar si ya no había captura.
    }
  };

  return {
    offset,
    dragging,
    reset: () => setOffset(0),
    stepBack: () => setOffset((o) => clamp(o + 1)),
    stepForward: () => setOffset((o) => clamp(o - 1)),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}
