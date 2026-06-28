import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';

import type { WindowRect } from '../lib/assistant-store.js';

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Las 8 asas de redimensión (4 bordes + 4 esquinas). */
export const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Tamaño mínimo de la ventana; sin máximo (se puede agrandar sin límite). */
const MIN_W = 300;
const MIN_H = 240;

interface DragState {
  kind: 'move' | 'resize';
  dir?: ResizeDir;
  px: number;
  py: number;
  start: WindowRect;
}

/**
 * Convierte un panel en una VENTANA FLOTANTE libre: se arrastra desde un asa (la cabecera) por toda
 * la pantalla SIN límites y se redimensiona desde bordes/esquinas. Opera sobre el rect del store
 * (x,y,w,h en px de viewport). Los listeners viven en `window` para que el gesto continúe aunque el
 * puntero salga del panel; tamaño mínimo MIN_W×MIN_H, sin máximo. Devuelve los handlers de
 * pointerdown para la cabecera (mover) y para cada asa (redimensionar).
 */
export function useFloatingWindow(rect: WindowRect, setRect: (r: WindowRect) => void) {
  const drag = useRef<DragState | null>(null);
  // Ref espejada del rect: los handlers de inicio leen el rect ACTUAL sin recrearse en cada render.
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
    document.body.classList.remove('chat-dock--dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const begin = useCallback(
    (state: DragState) => {
      drag.current = state;
      // Clase en <body>: cursor grabbing global + corta transiciones del panel mientras se manipula.
      document.body.classList.add('chat-dock--dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      // No arrastrar al pulsar los botones de la cabecera (historial/nueva/cerrar).
      if ((e.target as HTMLElement).closest('button')) return;
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

  // Seguridad: si el componente se desmonta a mitad de un gesto, suelta los listeners globales.
  useEffect(
    () => () => {
      document.body.classList.remove('chat-dock--dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  return { startMove, startResize };
}
