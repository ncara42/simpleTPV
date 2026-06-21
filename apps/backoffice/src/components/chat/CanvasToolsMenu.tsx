import { LayoutDashboard, Plus, Shapes, StickyNote, Type, Undo2, Wand2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import type { FreeBoardHandle } from '../FreeBoard.js';
import { WidgetPalette } from '../WidgetPalette.js';

interface CanvasToolsMenuProps {
  /** Handle imperativo del lienzo (puede ser null hasta que monta FreeBoard). */
  canvasRef: RefObject<FreeBoardHandle | null>;
  /** Hay pasos para deshacer (deshabilita «Deshacer»). */
  canUndo: boolean;
  /** El pill de dibujo está abierto (marca «Dibujar» como activo). */
  drawActive: boolean;
}

/**
 * Botón «+» con desplegable que agrupa las herramientas del lienzo (antes una barra de seis
 * botones). Vive en el dock inferior, junto al input del asistente, y dispara las acciones a
 * través del handle imperativo de FreeBoard. El desplegable abre hacia arriba (la barra está
 * abajo). Conserva los `data-testid` originales para los e2e.
 */
export function CanvasToolsMenu({ canvasRef, canUndo, drawActive }: CanvasToolsMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [widgets, setWidgets] = useState<{ id: string; label: string }[]>([]);

  // Cierra el menú (no la paleta) al pulsar Escape o hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const run = (fn: (h: FreeBoardHandle) => void): void => {
    const handle = canvasRef.current;
    if (handle) fn(handle);
    setOpen(false);
  };

  const openPalette = (): void => {
    setWidgets(canvasRef.current?.listWidgets() ?? []);
    setOpen(false);
    setPaletteOpen(true);
  };

  const labelFor = (id: string): string => widgets.find((w) => w.id === id)?.label ?? id;

  return (
    <div className="canvas-tools" data-testid="dash-free-toolbar" ref={ref}>
      <button
        type="button"
        className={`canvas-tools__trigger${open ? ' is-open' : ''}`}
        data-testid="dash-free-tools"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Herramientas del lienzo"
        title="Herramientas del lienzo"
        onClick={() => setOpen((o) => !o)}
      >
        <Plus size={18} aria-hidden="true" />
      </button>

      {open && (
        <div className="canvas-tools__menu" role="menu" aria-label="Herramientas del lienzo">
          <button
            type="button"
            role="menuitem"
            className="canvas-tools__item"
            data-testid="dash-free-add-widget"
            onClick={openPalette}
          >
            <LayoutDashboard size={16} aria-hidden="true" /> Widget
          </button>
          <button
            type="button"
            role="menuitem"
            className="canvas-tools__item"
            data-testid="dash-free-add-note"
            onClick={() => run((h) => h.addNote())}
          >
            <StickyNote size={16} aria-hidden="true" /> Nota
          </button>
          <button
            type="button"
            role="menuitem"
            className="canvas-tools__item"
            data-testid="dash-free-add-text"
            onClick={() => run((h) => h.addText())}
          >
            <Type size={16} aria-hidden="true" /> Texto
          </button>
          <button
            type="button"
            role="menuitem"
            className={`canvas-tools__item${drawActive ? ' is-active' : ''}`}
            data-testid="dash-free-draw"
            aria-pressed={drawActive}
            onClick={() => run((h) => h.toggleDraw())}
          >
            <Shapes size={16} aria-hidden="true" /> Dibujar
          </button>
          <span className="canvas-tools__sep" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="canvas-tools__item"
            data-testid="dash-free-undo"
            disabled={!canUndo}
            onClick={() => run((h) => h.undo())}
          >
            <Undo2 size={16} aria-hidden="true" /> Deshacer
          </button>
          <button
            type="button"
            role="menuitem"
            className="canvas-tools__item"
            data-testid="dash-free-arrange"
            onClick={() => run((h) => h.arrange())}
          >
            <Wand2 size={16} aria-hidden="true" /> Ordenar
          </button>
        </div>
      )}

      {paletteOpen && (
        <WidgetPalette
          items={widgets.map((w) => w.id)}
          label={labelFor}
          onPick={(id) => {
            canvasRef.current?.addWidget(id);
            setPaletteOpen(false);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
