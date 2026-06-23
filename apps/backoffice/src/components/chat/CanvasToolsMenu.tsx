import {
  Eraser,
  Hand,
  LayoutDashboard,
  Redo2,
  Shapes,
  SquarePen,
  StickyNote,
  Type,
  Undo2,
  Wand2,
} from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import type { FreeBoardHandle, InteractionMode } from '../FreeBoard.js';
import { WidgetPalette } from '../WidgetPalette.js';

interface CanvasToolsMenuProps {
  /** Handle imperativo del lienzo (puede ser null hasta que monta FreeBoard). */
  canvasRef: RefObject<FreeBoardHandle | null>;
  /** Hay pasos para deshacer (deshabilita «Deshacer»). */
  canUndo: boolean;
  /** Hay pasos para rehacer (deshabilita «Rehacer»). */
  canRedo: boolean;
  /** El pill de dibujo está abierto (marca «Dibujar» como activo). */
  drawActive: boolean;
  /** Modo de interacción activo (resalta Mover/Goma). */
  mode: InteractionMode;
}

/**
 * Barra de herramientas del lienzo: un botón «Editar» que DESPLIEGA hacia abajo (con animación)
 * las opciones de composición (widget, nota, texto, dibujar, ordenar) en un menú que cuelga de
 * «Editar» conectado por un cuello CÓNCAVO (esquina sup-izq recta + filete cóncavo a la derecha),
 * igual que el cuerpo del sidebar cuelga de su pestaña. Y —FUERA de ese menú— tres acciones
 * siempre visibles: «Mover» (pan del lienzo, para no confundirlo con arrastrar un widget), «Goma»
 * (borrar un elemento de un clic) y, junto a ella, «Deshacer». Dispara las acciones por el handle
 * imperativo de FreeBoard. Conserva los `data-testid` originales para los e2e.
 *
 * El menú va ANIDADO (no portaleado): al colgar por debajo de la píldora —fuera de su caja— su
 * `backdrop-filter` desenfoca el fondo real igual que el input, y al estar anidado queda anclado a
 * «Editar» por CSS (sin posicionar por JS), así no se desalinea al hacer zoom del navegador.
 */
export function CanvasToolsMenu({
  canvasRef,
  canUndo,
  canRedo,
  drawActive,
  mode,
}: CanvasToolsMenuProps) {
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

  // Activa/desactiva un modo (Mover/Goma). Pulsar el modo activo vuelve a 'select'. Cierra el menú.
  const toggleMode = (m: InteractionMode): void => {
    canvasRef.current?.setMode(mode === m ? 'select' : m);
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
        aria-label="Editar lienzo"
        title="Editar lienzo"
        onClick={() => setOpen((o) => !o)}
      >
        <SquarePen size={16} aria-hidden="true" />
        <span className="canvas-tools__trigger-label">Editar</span>
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
            data-testid="dash-free-arrange"
            onClick={() => run((h) => h.arrange())}
          >
            <Wand2 size={16} aria-hidden="true" /> Ordenar
          </button>
        </div>
      )}

      {/* Modos explícitos, FUERA del menú desplegable. */}
      <button
        type="button"
        className={`canvas-tools__mode${mode === 'pan' ? ' is-active' : ''}`}
        data-testid="dash-free-mode-pan"
        aria-pressed={mode === 'pan'}
        aria-label="Mover el lienzo"
        title="Mover el lienzo (arrastra sin mover widgets)"
        onClick={() => toggleMode('pan')}
      >
        <Hand size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`canvas-tools__mode${mode === 'erase' ? ' is-active' : ''}`}
        data-testid="dash-free-mode-erase"
        aria-pressed={mode === 'erase'}
        aria-label="Borrar elementos"
        title="Goma: clic en un elemento para borrarlo"
        onClick={() => toggleMode('erase')}
      >
        <Eraser size={16} aria-hidden="true" />
      </button>
      {/* «Deshacer» / «Rehacer» viven JUNTO a la goma (acciones sueltas, no modos): cada una se
          deshabilita cuando su pila está vacía. */}
      <button
        type="button"
        className="canvas-tools__mode"
        data-testid="dash-free-undo"
        aria-label="Deshacer"
        title="Deshacer"
        disabled={!canUndo}
        onClick={() => canvasRef.current?.undo()}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="canvas-tools__mode"
        data-testid="dash-free-redo"
        aria-label="Rehacer"
        title="Rehacer"
        disabled={!canRedo}
        onClick={() => canvasRef.current?.redo()}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>

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
