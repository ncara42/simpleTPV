import type { ReactNode } from 'react';

import { SectionHeader } from './atoms.js';

// Tarjeta de insight: encabezado consistente (SectionHeader) + cuerpo de contenido libre (slot).
// Presentacional y SIN dependencia de markdown: la app pasa el contenido ya renderizado como
// `children`, manteniendo react-markdown fuera de la librería compartida. Equivale al markup
// ad-hoc del antiguo GenericInsight, ahora reutilizable por GenericPanel (slot `insight`).
export interface InsightCardProps {
  title?: string;
  children: ReactNode;
}

export function InsightCard({ title, children }: InsightCardProps) {
  return (
    <article className="dv-insight">
      {title ? <SectionHeader title={title} /> : null}
      <div className="dv-insight-body">{children}</div>
    </article>
  );
}
