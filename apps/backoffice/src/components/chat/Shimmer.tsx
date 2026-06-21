import type { CSSProperties, ElementType, ReactNode } from 'react';

interface ShimmerProps {
  children: ReactNode;
  /** Elemento a renderizar (por defecto `span`). */
  as?: ElementType;
  className?: string;
  /** Duración del barrido en segundos (por defecto 2). */
  duration?: number;
}

/**
 * Texto con un barrido de luz animado (estilo Shimmer de ai-elements): ideal para estados de
 * carga ("Pensando…", "Razonando…"). Técnica CSS: gradiente animado con `background-clip: text`
 * sobre los tokens del sistema (sin framer-motion).
 */
export function Shimmer({ children, as: Tag = 'span', className, duration = 2 }: ShimmerProps) {
  const style = { '--shimmer-duration': `${duration}s` } as CSSProperties;
  return (
    <Tag className={`shimmer-text${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </Tag>
  );
}
