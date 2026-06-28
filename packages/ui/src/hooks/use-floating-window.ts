import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';

/** Geometría de la ventana flotante en px de viewport. */
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Las 8 asas de redimensión (4 bordes + 4 esquinas). */
export const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Tamaño mínimo de la ventana; sin máximo. */
const MIN_W = 300;
const MIN_H = 280;

interface DragState {
  kind: 'move' | 'resize';
  dir?: ResizeDir;
  px: number;
  py: number;
  start: WindowRect;
}

/**
 * Convierte un panel en una VENTANA FLOTANTE libre (mismo comportamiento que el ChatDock
 * del asistente): se arrastra desde un asa (la cabecera) por toda la pantalla y se
 * redimensiona desde bordes/esquinas. Opera sobre el rect (x,y,w,h). Los listeners viven
 * en `window` para que el gesto siga aunque el puntero salga del panel. Mientras se
 * manipula añade la clase `tc-dragging` a `<body>` (cursor global + cortar transiciones).
 */
export function useFloatingWindow(rect: WindowRect, setRect: (r: WindowRect) => void) {
  const drag = useRef<DragState | null>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (d.kind === 'move') {
        setRect({ ...d.start, x: d.start.x + dx, y: d.start.y + dy });
        return;
      }
      const dir = d.dir ?? 'se';
      let { x, y, w, h } = d.start;
      if (dir.includes('e')) w = Math.max(MIN_W, d.start.w + dx);
      if (dir.includes('s')) h = Math.max(MIN_H, d.start.h + dy);
      if (dir.includes('w')) {
        w = Math.max(MIN_W, d.start.w - dx);
        x = d.start.x + (d.start.w - w);
      }
      if (dir.includes('n')) {
        h = Math.max(MIN_H, d.start.h - dy);
        y = d.start.y + (d.start.h - h);
      }
      setRect({ x, y, w, h });
    },
    [setRect],
  );

  const onUp = useCallback(() => {
    drag.current = null;
    document.body.classList.remove('tc-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const begin = useCallback(
    (state: DragState) => {
      drag.current = state;
      document.body.classList.add('tc-dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      // No arrastrar al pulsar botones de la cabecera ni elementos marcados `data-no-drag`.
      if ((e.target as HTMLElement).closest('button, [data-no-drag]')) return;
      e.preventDefault();
      begin({ kind: 'move', px: e.clientX, py: e.clientY, start: rectRef.current });
    },
    [begin],
  );

  const startResize = useCallback(
    (dir: ResizeDir) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      begin({ kind: 'resize', dir, px: e.clientX, py: e.clientY, start: rectRef.current });
    },
    [begin],
  );

  // Si se desmonta a mitad de un gesto, suelta los listeners globales.
  useEffect(
    () => () => {
      document.body.classList.remove('tc-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  return { startMove, startResize };
}
