import { useCanvasBridge } from '../../lib/canvas-bridge.js';
import type { CanvasOp } from '../../lib/chat.js';
import {
  buildCanvasSnapshot,
  genericElementId,
  useDashboardStore,
} from '../../lib/dashboard-store.js';
import { ChatDock } from './ChatDock.js';

// Dock del asistente a nivel de shell: visible en TODAS las views. Las canvas_ops del agente se
// aplican SIEMPRE sobre el dashboard-store (no dependen de tener el FreeBoard montado), así el
// agente puede componer el dashboard desde cualquier vista; el lienzo las refleja al volver a él.
// El handle imperativo del lienzo (menú «+») solo está disponible en el Dashboard → se lee del
// puente y, si es null, el ChatDock se degrada a chat puro.
const applyCanvasOp = (op: CanvasOp) => useDashboardStore.getState().applyCanvasOp(op);

// Deshacer canvas_ops tras editar/regenerar: solo las add_* son inversibles. Los genéricos
// (genericSpec, incl. composite, e insight) se colocan bajo un id derivado del element_id del
// agente, así que el undo lo deriva IGUAL; el resto usa elementId (shapes/notas) o widgetId.
const undoCanvasOps = (ops: CanvasOp[]): void => {
  const store = useDashboardStore.getState();
  for (const op of ops) {
    const isGeneric = Boolean(op.genericSpec) || op.op === 'add_insight';
    const id =
      isGeneric && op.elementId ? genericElementId(op.elementId) : (op.elementId ?? op.widgetId);
    if (id) store.removeElement(id);
  }
};

export function AssistantDock() {
  const binding = useCanvasBridge((s) => s.binding);
  return (
    <ChatDock
      {...(binding ? { canvasRef: binding.canvasRef, canvasMeta: binding.canvasMeta } : {})}
      onCanvasOp={applyCanvasOp}
      onUndoCanvasOps={undoCanvasOps}
      getCanvasState={buildCanvasSnapshot}
    />
  );
}
