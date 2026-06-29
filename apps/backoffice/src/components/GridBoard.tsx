import { X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import {
  type FreeElement,
  type FreeLayout,
  freeUnitsFromPx,
  GRID_COARSE_COLS,
  GRID_COARSE_COLS_NARROW,
  gridCoarseUnits,
} from '../lib/dashboard-layout.js';
import { packGridTiles } from '../lib/grid-pack.js';
import { useEnterAnimation } from '../lib/use-enter-animation.js';
import { FreeNote } from './FreeNote.js';

// Modo CUADRÍCULA del dashboard: una vista alternativa del MISMO conjunto de widgets que el lienzo
// libre (mismos `freeLayouts` del preset). En vez de posicionar a píxel, los bloques teselan una
// rejilla REAL de 12 columnas que ocupa el ANCHO COMPLETO, con SOLO scroll vertical. El agente y el
// alta/baja manual escriben en el lienzo libre; aquí solo se RENDERIZA esa lista en rejilla.
//
// Solo se muestran los bloques de contenido —widgets (de catálogo y genéricos `gen:*`) y notas—;
// las formas/dibujos/textos sueltos son anotaciones espaciales propias del lienzo libre y no caben
// en una rejilla de flujo, así que se omiten (siguen visibles al volver al lienzo).
//
// CLAVE (rejilla regular y limpia): el tamaño en píxeles de cada elemento del lienzo CODIFICA su número
// entero de unidades FINAS (px = u·CELDA − GAP). Recuperamos esas unidades con `freeUnitsFromPx` y las
// CUANTIZAMOS a la rejilla GRUESA regular (`gridCoarseUnits`, 12 col): así el modo ordenado se ve como
// una rejilla bonita con gutter, no como un mosaico irregular de tallas a medida. Luego COMPACTAMOS con
// un empaquetado «skyline» (ver `grid-pack.ts`): cada bloque cae en el escalón más bajo donde cabe a lo
// ancho, así un bloque posterior rellena el hueco que deja uno alto SIN redimensionar a nadie. Las
// posiciones (columna/fila) se emiten EXPLÍCITAS sobre `repeat(N, 1fr)`; no se usa `auto-flow` (la
// compactación la hace el packer, no el navegador, que solo rellenaría celdas vacías triviales).
const GRID_KINDS = new Set<FreeElement['kind']>(['widget', 'note']);

// Columnas efectivas según el ancho disponible. El modo Cuadrícula tesela en la rejilla GRUESA regular
// (GRID_COARSE_COLS = 12) en cuanto hay sitio: 12 encaja limpio con los anchos cuantizados (3+3+3+3,
// 4+4+4, 7+5, 6+6) y da una rejilla bonita con gutter. En pantallas estrechas cae a 3 columnas: como los
// bloques miden ≥2 gruesas, se apilan a fila casi completa. Cada span se capa a este número → nada desborda.
function colsForWidth(width: number): number {
  if (width >= 480) return GRID_COARSE_COLS; // 12 — tablet/escritorio: rejilla regular y limpia
  return GRID_COARSE_COLS_NARROW; // 3 — móvil: bloques a fila completa, apilados sin huecos
}

// Mide el ancho del contenedor de flujo (vía ResizeObserver) y deriva las columnas efectivas. Por
// defecto 12 hasta la primera medida (coincide con el fallback del CSS, sin parpadeo en escritorio).
function useEffectiveCols(ref: React.RefObject<HTMLElement | null>): number {
  const [cols, setCols] = useState(GRID_COARSE_COLS);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setCols(colsForWidth(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

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

// Estilo de colocación de un tile a partir de su posición empaquetada (columna/fila base 0 →
// líneas de rejilla base 1). El packer ya capó el ancho a las columnas disponibles.
const tileGridStyle = (p: {
  col: number;
  row: number;
  cols: number;
  rows: number;
}): CSSProperties => ({
  gridColumn: `${p.col + 1} / span ${p.cols}`,
  gridRow: `${p.row + 1} / span ${p.rows}`,
});

export function GridBoard({
  elements,
  renderItem,
  itemLabel,
  onRemoveElement,
  onNoteChange,
}: GridBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const effectiveCols = useEffectiveCols(flowRef);

  // Bloques visibles en la rejilla, en ORDEN DE LECTURA de su posición libre (arriba→abajo,
  // izquierda→derecha): así la colocación del agente (anclas semánticas → coords) define el orden.
  const items = elements
    .filter((e) => GRID_KINDS.has(e.kind))
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Compactación «skyline» en ese orden → posición explícita (columna/fila) de cada tile, encajando
  // sin huecos a ancho completo. Se recalcula cuando cambian las columnas efectivas o los elementos.
  const placed = packGridTiles(
    items.map((e) => {
      const f = freeUnitsFromPx(e.w, e.h);
      const u = gridCoarseUnits(f.cols, f.rows);
      return { id: e.id, cols: u.cols, rows: u.rows };
    }),
    effectiveCols,
  );
  const placedById = new Map(placed.map((p) => [p.id, p]));

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
      <div
        className="dash-grid-flow"
        ref={flowRef}
        style={{ gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))` }}
      >
        {items.map((el) => (
          <div
            key={el.id}
            className={`dash-grid-tile dash-grid-tile--${el.kind}`}
            style={tileGridStyle(placedById.get(el.id)!)}
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
    </div>
  );
}
