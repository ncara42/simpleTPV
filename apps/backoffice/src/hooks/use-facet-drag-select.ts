import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';

// Selección por arrastre («pintar») para las casillas de faceta del backoffice, que CONVIVE
// con el click simple y el teclado:
//
// - CLICK SIMPLE (sin desplazarse a otra opción): no se interfiere; togglea con el onChange
//   nativo del checkbox, como siempre. También el teclado (Espacio) sigue igual.
// - ARRASTRE: al pulsar se fija el MODO según el estado inicial del ancla (desmarcada →
//   «marcar»; marcada → «desmarcar») pero NO se togglea aún. En cuanto el ratón entra en
//   OTRA opción se confirma el arrastre: se aplica el modo al ancla y a cada opción que se
//   cruza (idempotente: solo cambia las que aún no están en el destino). El único click
//   nativo que se anula es el del ancla tras un arrastre (su toggle ya se hizo a mano), para
//   no contarlo dos veces.
//
// Un único hook por carril (el estado de arrastre es compartido por todas las opciones); el
// padre lo instancia una vez y reparte los handlers a cada casilla.

interface DragState {
  /** Estado destino del arrastre: true = marcar, false = desmarcar. */
  mode: boolean;
  /** ¿El ratón ya entró en otra opción? (distingue arrastre de click simple). */
  moved: boolean;
  /** Toggle de la opción ancla (donde se pulsó), aplicado al confirmarse el arrastre. */
  anchorToggle: () => void;
}

export interface FacetDragSelect {
  /** mousedown sobre la casilla: arma el posible arrastre (sin togglear todavía). */
  onItemMouseDown: (checked: boolean, toggle: () => void) => void;
  /** mouseenter sobre la casilla con el botón pulsado: «pinta» según el modo. */
  onItemMouseEnter: (checked: boolean, toggle: () => void) => void;
  /** click del input: solo anula el del ancla tras un arrastre; el click simple pasa intacto. */
  onItemClick: (event: MouseEvent) => void;
}

export function useFacetDragSelect(): FacetDragSelect {
  const stateRef = useRef<DragState | null>(null);
  // Tras un arrastre, anula el siguiente click del ancla (su toggle ya se hizo a mano).
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const onUp = () => {
      if (stateRef.current?.moved) suppressClickRef.current = true;
      stateRef.current = null;
    };
    // Cualquier tecla cancela una supresión pendiente → el teclado nunca se queda bloqueado.
    const onKey = () => {
      suppressClickRef.current = false;
    };
    // El arrastre termina aunque se suelte fuera del carril.
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const onItemMouseDown = useCallback((checked: boolean, toggle: () => void) => {
    // Nueva interacción: arma el arrastre, pero deja el toggle al onChange nativo por si
    // resulta ser un click simple (no nos hemos movido todavía).
    suppressClickRef.current = false;
    stateRef.current = { mode: !checked, moved: false, anchorToggle: toggle };
  }, []);

  const onItemMouseEnter = useCallback((checked: boolean, toggle: () => void) => {
    const state = stateRef.current;
    if (!state) return;
    if (!state.moved) {
      // Primer desplazamiento a otra opción → es un arrastre: aplica ya el modo al ancla.
      state.moved = true;
      state.anchorToggle();
    }
    if (checked !== state.mode) toggle();
  }, []);

  const onItemClick = useCallback((event: MouseEvent) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
    }
  }, []);

  return { onItemMouseDown, onItemMouseEnter, onItemClick };
}
