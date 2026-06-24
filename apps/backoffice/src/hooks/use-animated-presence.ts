import { useEffect, useRef, useState } from 'react';

/** Resultado de {@link useAnimatedPresence}. */
export interface AnimatedPresence {
  /** El nodo debe estar montado (true al abrir y mientras dura la animación de salida). */
  isMounted: boolean;
  /** Está reproduciéndose la salida: aplica aquí la clase `is-closing` para el keyframe inverso. */
  isClosing: boolean;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Mantiene un elemento montado mientras reproduce su animación de SALIDA, para que al cerrar se
 * vea la misma animación (inversa) que la entrada en lugar de desaparecer de golpe — el problema
 * típico de `{open && <X/>}`, que desmonta al instante.
 *
 * Cuando `isOpen` pasa a `false`, conserva el nodo durante `durationMs` y expone `isClosing` para
 * que el CSS reproduzca el keyframe inverso; al terminar lo desmonta. Respeta
 * `prefers-reduced-motion`: desmonta de inmediato, sin retardo ni clase de cierre.
 *
 * @param isOpen     Estado deseado, controlado por el componente.
 * @param durationMs Duración de la animación de salida en ms (debe coincidir con la del CSS).
 */
export function useAnimatedPresence(isOpen: boolean, durationMs: number): AnimatedPresence {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      // (Re)apertura: cancela cualquier cierre en curso y monta.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setIsClosing(false);
      setIsMounted(true);
      return;
    }

    if (!isMounted) return; // ya desmontado, nada que cerrar

    if (durationMs <= 0 || prefersReducedMotion()) {
      // Sin animación: desmonta de inmediato.
      setIsClosing(false);
      setIsMounted(false);
      return;
    }

    setIsClosing(true);
    timer.current = setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
      timer.current = null;
    }, durationMs);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [isOpen, isMounted, durationMs]);

  return { isMounted, isClosing };
}
