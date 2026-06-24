import { X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';

import { type FreeElement, type FreeLayout } from '../lib/dashboard-layout.js';
import { useEnterAnimation } from '../lib/use-enter-animation.js';
import { FreeNote } from './FreeNote.js';

// Modo CUADRÍCULA del dashboard: una vista alternativa del MISMO conjunto de widgets que el lienzo
// libre (mismos `freeLayouts` del preset). En vez de posicionar a píxel, los bloques fluyen en una
// rejilla responsive (3–5 columnas según el ancho, `auto-fill`) con SOLO scroll vertical. El agente
// y el alta/baja manual escriben en el lienzo libre; aquí solo se RENDERIZA esa lista en rejilla.
//
// Solo se muestran los bloques de contenido —widgets (de catálogo y genéricos `gen:*`) y notas—;
// las formas/dibujos/textos sueltos son anotaciones espaciales propias del lienzo libre y no caben
// en una rejilla de flujo, así que se omiten (siguen visibles al volver al lienzo).

// Umbrales (en px de mundo del elemento) para derivar el tramo de la rejilla. Un KPI mide ~184×144,
// un panel/gráfica ~484–684 × ~304, y los compuestos/tablas/rotación ~464–784 de alto.
// - Ancho: solo lo de verdad ancho (w7≈684, compuestos) pasa a 2 columnas; w5≈484 cae a 1 → compacto.
// - Alto en 3 tramos: KPI→1 fila; panel/gráfica (304)→2 filas (altura legible); compuesto/tabla
//   (≥440)→3 filas para que quepa SIN recorte (un compuesto 5-en-1 no entra en 2 filas).
const WIDE_PX = 520;
const TALL_PX = 200;
const XTALL_PX = 440;
const GRID_KINDS = new Set<FreeElement['kind']>(['widget', 'note']);

interface GridBoardProps {
  /** Disposición libre del preset (la misma que ve el lienzo); se filtra a widgets + notas. */
  elements: FreeLayout;
  /** Renderiza el contenido de un widget por su id de catálogo (o `gen:*`). */
  renderItem: (widgetId: string) => ReactNode;
  /** Etiqueta legible de un widget (paleta + aria). */
  itemLabel: (widgetId: string) => string;
  /** Quita un elemento por id (widget o nota). */
  onRemoveElement: (id: string) => void;
  /** Persiste el documento de una nota al editarla. */
  onNoteChange: (id: string, doc: unknown) => void;
}

const colSpan = (e: FreeElement): number => (e.w >= WIDE_PX ? 2 : 1);
const rowSpan = (e: FreeElement): number => (e.h >= XTALL_PX ? 3 : e.h >= TALL_PX ? 2 : 1);

export function GridBoard({
  elements,
  renderItem,
  itemLabel,
  onRemoveElement,
  onNoteChange,
}: GridBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Bloques visibles en la rejilla, en ORDEN DE LECTURA de su posición libre (arriba→abajo,
  // izquierda→derecha): así la colocación del agente (anclas semánticas → coords) define el orden.
  const items = elements
    .filter((e) => GRID_KINDS.has(e.kind))
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Entrada con rebote escalonado de los tiles recién añadidos (a mano o por el agente). En el
  // montaje del board (cambio de modo) no anima: lo gobierna el morph.
  useEnterAnimation(
    items.map((e) => e.id),
    () => gridRef.current,
  );

  const labelFor = (el: FreeElement): string =>
    el.kind === 'widget' ? itemLabel(el.widgetId) : 'Nota';

  return (
    <div className="dash-grid" data-testid="dash-grid" ref={gridRef}>
      <div className="dash-grid-flow">
        {items.map((el) => (
          <div
            key={el.id}
            className={`dash-grid-tile dash-grid-tile--${el.kind}`}
            style={{ gridColumn: `span ${colSpan(el)}`, gridRow: `span ${rowSpan(el)}` }}
            data-testid={`dash-grid-tile-${el.id}`}
            data-board-item={el.id}
          >
            <button
              type="button"
              className="dash-grid-remove"
              data-testid={`dash-grid-remove-${el.id}`}
              aria-label={`Quitar ${labelFor(el)}`}
              title="Quitar"
              onClick={() => onRemoveElement(el.id)}
            >
              <X size={13} aria-hidden="true" />
            </button>
            <div className="dash-grid-tile-body">
              {el.kind === 'widget' ? (
                renderItem(el.widgetId)
              ) : el.kind === 'note' ? (
                <FreeNote doc={el.doc} onChange={(doc) => onNoteChange(el.id, doc)} />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="dash-grid-hint" data-testid="dash-grid-empty">
          Rejilla en blanco · añade widgets con «+» (arriba) o pídeselos al asistente
        </p>
      )}
    </div>
  );
}
