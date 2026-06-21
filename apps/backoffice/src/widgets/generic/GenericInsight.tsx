import { InsightCard } from '@simpletpv/ui';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

interface GenericInsightProps {
  spec: GenericSpec;
}

// Tarjeta de insight: markdown persistente que el agente escribe en el lienzo (no consulta ningún
// endpoint). Delega la chrome de tarjeta (encabezado + cuerpo) en la molécula InsightCard (#203, F2);
// el render de markdown se queda en la app (react-markdown no vive en la librería compartida). El
// contenido está en `spec.params.markdown`; `spec.title` es el encabezado.
export function GenericInsight({ spec }: GenericInsightProps) {
  const markdown = typeof spec.params?.markdown === 'string' ? spec.params.markdown : '';
  return (
    <div className="dash-generic dash-generic--insight" data-testid="dash-generic-insight">
      <InsightCard title={spec.title}>
        <div className="dash-generic-md">
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </div>
      </InsightCard>
    </div>
  );
}
