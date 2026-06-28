import { create } from 'zustand';

// Rect de la ventana flotante del asistente, en px de viewport (la geometría va como estilo inline
// en el panel; ver useFloatingWindow). Movible/redimensionable sin límites; persiste en memoria
// entre aperturas y cambios de view.
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_W = 400;
const DEFAULT_H = 560;

// Posición inicial: anclada arriba-derecha bajo la topbar, acotada al viewport para no salirse en
// pantallas pequeñas. Sin `window` (tests/SSR) cae a un valor fijo razonable.
function defaultRect(): WindowRect {
  if (typeof window === 'undefined') return { x: 880, y: 64, w: DEFAULT_W, h: DEFAULT_H };
  const w = Math.min(DEFAULT_W, window.innerWidth - 32);
  const h = Math.min(DEFAULT_H, window.innerHeight - 96);
  return { x: Math.max(16, window.innerWidth - w - 16), y: 64, w, h };
}

// Estado abrir/cerrar + geometría del asistente, compartido entre el LANZADOR (botón robot en la
// isla de la TopBar) y la SUPERFICIE (ventana flotante = ChatDock/AssistantDock). Son hermanos en el
// árbol, así que el toggle y el rect viven en este store mínimo (patrón useCanvasBridge). La ventana
// es overlay `position: fixed`: nunca reflowa el lienzo → abrirla/moverla no reescala widgets.
interface AssistantState {
  open: boolean;
  rect: WindowRect;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setRect: (rect: WindowRect) => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  rect: defaultRect(),
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  setRect: (rect) => set({ rect }),
}));
