import type { RefObject } from 'react';
import { create } from 'zustand';

import type { CanvasMeta, FreeBoardHandle } from '../components/FreeBoard.js';

// Puente lienzo ↔ dock del asistente. El `ChatDock` vive ahora en el shell (visible en TODAS
// las views), pero el menú «+» de herramientas del lienzo necesita el handle imperativo del
// FreeBoard y su estado (deshacer/dibujo), que solo existen mientras el DashboardPage está
// montado. La página registra aquí su binding al montar y lo limpia al desmontar; cuando es
// `null` (cualquier view que no sea el Dashboard) el dock oculta las herramientas de lienzo y
// queda como chat puro. Las canvas_ops del agente NO pasan por aquí: van directas al
// dashboard-store (ver AssistantDock), así el agente puede componer el dashboard desde cualquier
// view.
export interface CanvasBinding {
  canvasRef: RefObject<FreeBoardHandle | null>;
  canvasMeta: CanvasMeta;
}

interface CanvasBridgeState {
  binding: CanvasBinding | null;
  setBinding: (binding: CanvasBinding | null) => void;
}

export const useCanvasBridge = create<CanvasBridgeState>((set) => ({
  binding: null,
  setBinding: (binding) => set({ binding }),
}));
