import { useEffect, useRef, useState } from 'react';

/**
 * Conteo adaptativo de filas para listas/rankings responsivos: mide el contenedor con un
 * `ResizeObserver` y devuelve cuántas filas de ~`rowHeight` px (más el `gap` entre ellas) caben en su
 * alto. La lista muestra `data.slice(0, count)` → más elementos en tiles altos, menos en bajos, sin
 * filas a medias ni hueco al fondo. El `ref` va en el contenedor de filas (el que tiene el alto útil).
 */
export function useFitCount(
  rowHeight: number,
  opts?: { gap?: number; min?: number; max?: number },
): { ref: React.RefObject<HTMLDivElement | null>; count: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const gap = opts?.gap ?? 0;
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 50;
  const [count, setCount] = useState(min);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const h = el.clientHeight;
      // n filas ocupan n·rowHeight + (n−1)·gap ≤ h  ⇒  n ≤ (h + gap) / (rowHeight + gap)
      const n = Math.floor((h + gap) / (rowHeight + gap));
      setCount(Math.max(min, Math.min(max, n)));
    };
    measure();
    // ResizeObserver no existe en JSDOM (tests): medimos una vez y salimos sin observar.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, gap, min, max]);

  return { ref, count };
}
