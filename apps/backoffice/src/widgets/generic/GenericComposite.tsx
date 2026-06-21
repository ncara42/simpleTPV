import { Fragment } from 'react';

import {
  type CompositeNode,
  type GenericSpec,
  MAX_COMPOSITE_DEPTH,
} from '../../lib/dashboard-layout.js';
import { GenericWidget } from './GenericWidget.js';

interface GenericCompositeProps {
  spec: GenericSpec;
}

// Widget compuesto (#189): renderiza el árbol `CompositeNode` recursivamente como una sola
// tarjeta a medida. Un `stack` agrupa hijos en fila (grid) o columna (flex); una `leaf` delega
// en el despachador `GenericWidget` (cada hoja hace su propio fetch en paralelo vía useGenericData).
// El árbol ya llega validado/normalizado desde `normalizeGenericSpec` (dashboard-store).
export function GenericComposite({ spec }: GenericCompositeProps) {
  if (!spec.root) return null;
  return (
    <div className="generic-composite dash-generic" data-testid="generic-composite">
      {spec.title ? <figcaption className="dash-generic-title">{spec.title}</figcaption> : null}
      {renderNode(spec.root, 0)}
    </div>
  );
}

// Renderiza un nodo del árbol. Acota la profundidad: un nodo a `depth >= MAX_COMPOSITE_DEPTH`
// no se pinta (la raíz es depth 0, así que se permiten MAX niveles de anidación). `span` se
// aplica al propio nodo como item del grid del padre (`grid-column: span N`).
function renderNode(node: CompositeNode, depth: number): React.ReactNode {
  if (depth >= MAX_COMPOSITE_DEPTH) return null;

  const spanStyle: React.CSSProperties | undefined = node.span
    ? { gridColumn: `span ${node.span}` }
    : undefined;

  if (node.kind === 'leaf') {
    // Un ÚNICO título por hoja: el `title` del nodo (rótulo legible) tiene prioridad sobre el del
    // spec (que el agente suele dejar vacío). Se delega el render del título al propio widget
    // (figcaption del chart / label del KPI), evitando el doble título que salía antes (rótulo de
    // sección + un "Widget" del spec).
    const leafSpec = node.title ? { ...node.spec, title: node.title } : node.spec;
    return (
      <div className="generic-composite-leaf" style={spanStyle}>
        <GenericWidget spec={leafSpec} />
      </div>
    );
  }

  // stack. `span` solo surte efecto si el padre es un stack `dir:row` (display:grid); en flex
  // (`dir:col`) los hijos ya ocupan el ancho completo y grid-column se ignora.
  const stackClass =
    node.dir === 'row' ? 'generic-composite-stack-row' : 'generic-composite-stack-col';
  const gapStyle: React.CSSProperties | undefined =
    node.gap != null ? { gap: `${node.gap}px` } : undefined;
  // Defensa: el árbol normalizado siempre trae `children` array, pero hydrate re-registra specs
  // persistidos (potencialmente manipulados) sin revalidar — no reventar el render si falta.
  const children = Array.isArray(node.children) ? node.children : [];

  return (
    <div className="generic-composite-node" style={spanStyle}>
      {node.title ? <div className="generic-composite-section-title">{node.title}</div> : null}
      <div className={stackClass} style={gapStyle}>
        {children.map((child, i) => (
          <Fragment key={`${child.kind}-${i}`}>{renderNode(child, depth + 1)}</Fragment>
        ))}
      </div>
    </div>
  );
}
