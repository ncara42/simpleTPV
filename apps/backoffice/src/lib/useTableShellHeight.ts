import { useLayoutEffect, useState } from 'react';

// Las vistas con tabla (Inventario, Proveedores, Ventas, B2B, Traspasos, Promociones…)
// reservaban su alto con un `calc(100dvh - 60px - Nrem)` HARDCODEADO en CSS, asumiendo
// una topbar de altura fija. Desde que la topbar se partió en dos pisos (banda del
// programa + «topbar de la tabla», esta última de alto VARIABLE — envuelve en pantallas
// estrechas, o no existe si la vista no declara acciones), esa constante quedaba corta o
// se pasaba, y el DOCUMENTO ENTERO acababa haciendo scroll (feo: la tabla ya scrollea por
// dentro). Este hook mide el alto real del header en cada resize/cambio de la sub-barra y
// lo resta del viewport, para que el "shell" de la vista NUNCA supere el hueco disponible.

/**
 * Alto (px) disponible para el "shell" de una vista con tabla, ya restado el header real
 * (topbar + sub-barra de la tabla si existe) y el resto de presupuesto propio de la vista
 * (`extraRem`, por defecto 1.9 = los mismos 0.4rem + 1.5rem de padding de
 * `.bo-main--surface` que ya usaban estas vistas). Aplícalo como `style={{ height }}` en
 * el mismo wrapper que antes solo llevaba la clase con el `calc()` fijo: mientras el hook
 * aún no ha medido (primer tick), `height` es `undefined` y el `calc()` de la hoja de
 * estilos actúa de red de seguridad.
 */
export function useTableShellHeight(extraRem = 1.9): number | undefined {
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    // Fallback a 16px si el entorno no resuelve `font-size` a un valor numérico (p. ej.
    // JSDOM en tests unitarios, sin layout real) — evita propagar NaN al `height` final.
    const parsedFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const rootFontSize = Number.isFinite(parsedFontSize) ? parsedFontSize : 16;
    const extraPx = extraRem * rootFontSize;

    const measure = (): void => {
      const chrome =
        document.querySelector('.topbar-tablebar') ??
        document.querySelector('[data-testid="topbar"]');
      const chromeBottom = chrome?.getBoundingClientRect().bottom ?? 0;
      setHeight(Math.max(0, window.innerHeight - chromeBottom - extraPx));
    };

    measure();
    window.addEventListener('resize', measure);

    // Observa `.app-content` (siempre presente desde el primer render): su alto agrega
    // topbar + sub-barra + contenido, así que cambia en cuanto CUALQUIERA de esas piezas
    // cambia de tamaño (p. ej. la sub-barra envolviendo), sin depender de si `.topbar-tablebar`
    // ya existía en el DOM cuando este efecto arrancó.
    const content = document.querySelector('.app-content');
    const ro = content ? new ResizeObserver(measure) : undefined;
    if (content && ro) ro.observe(content);

    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [extraRem]);

  return height;
}
