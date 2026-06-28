import { create } from 'zustand';

// Estado abrir/cerrar del asistente, compartido entre el LANZADOR (botón ✦ en la isla de la
// TopBar, montado en App.tsx) y la SUPERFICIE (drawer lateral derecho = ChatDock/AssistantDock).
// Son hermanos en el árbol, así que el toggle no puede viajar por props: vive en este store mínimo
// (mismo patrón que useCanvasBridge / useDashboardStore). El drawer es overlay `position: fixed`,
// nunca reflowa el lienzo → abrirlo no reescala widgets ni tablas.
interface AssistantState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
}));
