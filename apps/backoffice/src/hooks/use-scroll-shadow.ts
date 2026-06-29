import { useCallback, useEffect, useRef, useState } from 'react';

// Sombra de scroll: pista visual de «aún hay contenido más abajo». Un degradado en el
// borde inferior del scroller que aparece cuando hay overflow y se difumina al llegar al
// final. La detección NO usa un listener de scroll (que dispararía en cada frame al
// desplazar), sino un IntersectionObserver sobre un centinela al final del contenido:
// cuando el centinela entra en el viewport del scroller estamos al fondo → sin sombra.
//
// El padre pone `scrollRef` en el contenedor con `overflow:auto`, `sentinelRef` en un
// elemento de alto ~0 al final de su contenido, y aplica `showShadow` (clase) sobre el
// envoltorio que pinta el degradado. Los refs son callbacks: el observer se (re)conecta
// solo cuando ambos elementos están montados, así que sobrevive a que la lista pase de
// vacía a con filas (y viceversa) sin depender de un array de dependencias.

type RefCallback = (node: HTMLElement | null) => void;

export interface ScrollShadow {
  /** Ref (callback) para el contenedor scrollable (root del observer). */
  scrollRef: RefCallback;
  /** Ref (callback) para el centinela (último hijo, alto ~0) del contenido. */
  sentinelRef: RefCallback;
  /** `true` cuando hay overflow pendiente por debajo (mostrar la sombra). */
  showShadow: boolean;
}

export function useScrollShadow(): ScrollShadow {
  // Por defecto al final (sin sombra): si hay overflow, el observer lo corrige al instante.
  const [atEnd, setAtEnd] = useState(true);
  const scrollEl = useRef<HTMLElement | null>(null);
  const sentinelEl = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const connect = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    const root = scrollEl.current;
    const sentinel = sentinelEl.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') {
      // Sin scroller o sin centinela montados: no hay overflow que señalar.
      setAtEnd(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setAtEnd(entry.isIntersecting);
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    observerRef.current = observer;
  }, []);

  const scrollRef = useCallback<RefCallback>(
    (node) => {
      scrollEl.current = node;
      connect();
    },
    [connect],
  );
  const sentinelRef = useCallback<RefCallback>(
    (node) => {
      sentinelEl.current = node;
      connect();
    },
    [connect],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { scrollRef, sentinelRef, showShadow: !atEnd };
}
