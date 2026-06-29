import type { ElementType, ReactNode } from 'react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';

// Envuelve un scroller que es a la vez celda del layout (un carril `.cat-rail`, una tabla
// `.cat-main`…) con la sombra de scroll: pinta el host NO scrollable (`.scroll-shadow-cell
// .scroll-shadow-host`), pone el `ref` del observer en el propio scroller y le añade el
// centinela como último hijo. Para scrollers que YA tienen un padre no scrollable (las
// listas/fichas del maestro-detalle) no hace falta: ahí se cablea `useScrollShadow` a mano
// sobre el padre existente.

interface ScrollShadowCellProps {
  /** Etiqueta del scroller (p. ej. 'aside' para el carril, 'div' para la tabla). */
  as?: ElementType;
  /** Clases del scroller (las del layout: `cat-rail`, `cat-main`…). */
  className?: string;
  children: ReactNode;
  /** Resto de props del scroller (aria-label, data-testid…). */
  [prop: string]: unknown;
}

export function ScrollShadowCell({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: ScrollShadowCellProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();
  return (
    <div
      className={`scroll-shadow-cell scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}
    >
      <Tag className={className} ref={scrollRef} {...rest}>
        {children}
        <span className="scroll-shadow-sentinel" ref={sentinelRef} aria-hidden="true" />
      </Tag>
    </div>
  );
}
