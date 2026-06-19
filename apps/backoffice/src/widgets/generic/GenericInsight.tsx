import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

interface GenericInsightProps {
  spec: GenericSpec;
}

// Tarjeta de insight: markdown persistente que el agente escribe en el lienzo (no consulta
// ningún endpoint). El contenido vive en `spec.params.markdown`; `spec.title` es el encabezado.
export function GenericInsight({ spec }: GenericInsightProps) {
  const markdown = typeof spec.params?.markdown === 'string' ? spec.params.markdown : '';
  return (
    <article className="dash-generic dash-generic--insight" data-testid="dash-generic-insight">
      <h3 className="dash-generic-title">{spec.title}</h3>
      <div className="dash-generic-md">
        <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
      </div>
    </article>
  );
}
