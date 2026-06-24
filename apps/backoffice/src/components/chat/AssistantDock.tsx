import type { CanvasOp, ViewActionName } from '../../lib/chat.js';
import {
  buildCanvasSnapshot,
  genericElementId,
  useDashboardStore,
} from '../../lib/dashboard-store.js';
import { ChatDock } from './ChatDock.js';
import { executeViewAction } from './view-actions.js';
import type { ViewContext } from './view-context.js';

// Dock del asistente a nivel de shell: visible en TODAS las views. Las canvas_ops del agente se
// aplican SIEMPRE sobre el dashboard-store (no dependen de tener el FreeBoard montado), así el
// agente puede componer el dashboard desde cualquier vista; el lienzo las refleja al volver a él.
// El handle imperativo del lienzo (menú «+») solo está disponible en el Dashboard → se lee del
// puente y, si es null, el ChatDock se degrada a chat puro.
const applyCanvasOp = (op: CanvasOp) => useDashboardStore.getState().applyCanvasOp(op);

// Deshacer canvas_ops tras editar/regenerar: solo las add_* son inversibles. Los genéricos
// (genericSpec, incl. composite) se colocan bajo un id derivado del element_id del agente, así que
// el undo lo deriva IGUAL; el resto (shapes, notas, e insight→nota) usa elementId; o widgetId.
const undoCanvasOps = (ops: CanvasOp[]): void => {
  const store = useDashboardStore.getState();
  for (const op of ops) {
    const isGeneric = Boolean(op.genericSpec);
    const id =
      isGeneric && op.elementId ? genericElementId(op.elementId) : (op.elementId ?? op.widgetId);
    if (id) store.removeElement(id);
  }
};

export function AssistantDock({ view }: { view: ViewContext }) {
  // La barra de herramientas del lienzo vive ahora ARRIBA en el DashboardPage (no en el dock); el
  // dock es chat puro en todas las views. Por eso ya no consume el canvas-bridge.
  return (
    <ChatDock
      onCanvasOp={applyCanvasOp}
      onUndoCanvasOps={undoCanvasOps}
      getCanvasState={buildCanvasSnapshot}
      onViewAction={(action, args) => executeViewAction(action as ViewActionName, args)}
      view={view}
      // El dock se ancla SIEMPRE abajo-centro (barra inferior), también en el Dashboard. Antes el
      // Dashboard usaba el modo «héroe» (composer grande centrado en el viewport), pero el input
      // debe vivir abajo como en el resto de views. (El modo héroe sigue disponible en ChatDock por
      // si se reactiva; aquí no se opta a él.)
    />
  );
}
