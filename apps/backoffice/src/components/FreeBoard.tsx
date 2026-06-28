import { ArrowUpRight, Circle, MousePointer2, Pencil, Slash, Square, X } from 'lucide-react';
import {
  memo,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  addDraw,
  addNote,
  addShape,
  addText,
  addWidget,
  autoArrangeFree,
  availableWidgets,
  bringToFront,
  DRAW_COLORS,
  DRAW_STROKE_WIDTH,
  type FreeDraw,
  type FreeElement,
  type FreeLayout,
  type FreeShape,
  removeElement,
  type ShapeKind,
  updateElement,
} from '../lib/dashboard-layout.js';
import {
  contentBounds,
  minimapClickToPan,
  minimapProjection,
  offscreenArrow,
} from '../lib/free-geometry.js';
import { useEnterAnimation } from '../lib/use-enter-animation.js';
import { FreeMinimap } from './FreeMinimap.js';
import { FreeNote } from './FreeNote.js';
import { FreeShapeView } from './FreeShapeView.js';
import { FreeText } from './FreeText.js';

// Lienzo "edgeless" estilo Affine: los elementos viven en coordenadas de MUNDO (px) dentro de
// un `world` con transform translate(pan)·scale(zoom) y transform-origin 0 0; el viewport
// recorta y recibe los gestos. screen = world·zoom + pan ⇒ world = (screen − pan)/zoom.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.2;
const PAN_THRESHOLD = 4; // px para distinguir pan de click
const DRAG_THRESHOLD_PX = 4; // px para distinguir arrastre de un elemento de un click en su contenido
const FIT_PADDING = 48;
// Tope de zoom al CENTRAR/AJUSTAR la vista al contenido: nunca acercar más del 85%, aunque el
// contenido sea pequeño y cupiera más grande (deja aire alrededor). El zoom manual sí llega a ZOOM_MAX.
const FIT_MAX_ZOOM = 0.85;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const KEY_PAN = 48; // px de pan por flecha en el fondo
const KEY_MOVE = 10; // px de mundo por flecha al mover un elemento enfocado
const HISTORY_MAX = 50; // tope de la pila de deshacer
// Alto ≈ al del composer del asistente expandido (≈104px), su vecino abajo: así el minimapa no
// lo sobresale (ambos anclados a `bottom: 1rem`). El ancho mayor da una caja apaisada acorde al
// viewport (más ancho que alto); la proyección encaja el contenido por `contain`, sin deformar.
const MINIMAP_SIZE = { width: 180, height: 104 };
const MIN_SHAPE = 4; // px de mundo mínimos para crear una forma (evita formas de un clic)
const NOTE_MIN_W = 160; // px de mundo mínimos al redimensionar una nota
const NOTE_MIN_H = 120;

// Herramienta activa del lienzo. 'select' = navegar/arrastrar; el resto crea elementos al
// arrastrar sobre el fondo. El texto NO es una herramienta de lienzo: se crea con un botón.
type ToolId = 'select' | 'pen' | 'rect' | 'ellipse' | 'line' | 'arrow';
const TOOLS: Array<{ id: ToolId; label: string; Icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Seleccionar y mover', Icon: MousePointer2 },
  { id: 'pen', label: 'Lápiz · dibujar o escribir a mano', Icon: Pencil },
  { id: 'rect', label: 'Rectángulo', Icon: Square },
  { id: 'ellipse', label: 'Elipse', Icon: Circle },
  { id: 'line', label: 'Línea', Icon: Slash },
  { id: 'arrow', label: 'Flecha', Icon: ArrowUpRight },
];

// Modo de interacción del lienzo (separado de la herramienta de dibujo). Lo refleja el dock.
export type InteractionMode = 'select' | 'pan' | 'erase';

interface View {
  panX: number;
  panY: number;
  zoom: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Metadatos reactivos del lienzo que la barra inferior externa necesita reflejar. */
export interface CanvasMeta {
  /** Hay pasos en la pila de deshacer. */
  canUndo: boolean;
  /** Hay pasos en la pila de rehacer. */
  canRedo: boolean;
  /** El pill de dibujo está abierto. */
  drawOpen: boolean;
  /** Modo de interacción activo (select/pan/erase) → la barra resalta el botón. */
  mode: InteractionMode;
  /** Porcentaje de zoom actual (ej. 100 = 100%). */
  zoomPct: number;
}

/** API imperativa del lienzo expuesta a la barra inferior (el dock del dashboard). Las
 *  acciones de toolbar viven aquí porque dependen del estado interno del lienzo (centro de
 *  vista, historial, herramienta activa); el dock las invoca a través de este handle. */
export interface FreeBoardHandle {
  addWidget: (widgetId: string) => void;
  addNote: () => void;
  addText: () => void;
  toggleDraw: () => void;
  undo: () => void;
  redo: () => void;
  arrange: () => void;
  /** Fija el modo de interacción (MOVER/GOMA/normal). Al salir de 'select' cierra el dibujo. */
  setMode: (mode: InteractionMode) => void;
  /** Snapshot de los widgets de catálogo disponibles para añadir (no presentes). */
  listWidgets: () => { id: string; label: string }[];
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitZoom: () => void;
}

interface FreeBoardProps {
  /** Disposición inicial (ya migrada/reconciliada con el preset). */
  elements: FreeLayout;
  /** Renderiza el contenido de un widget por su id de catálogo. */
  renderItem: (widgetId: string) => ReactNode;
  /** Etiqueta legible de un widget (paleta + aria). */
  itemLabel: (widgetId: string) => string;
  /** Se invoca con la disposición completa a persistir tras cada cambio confirmado. */
  onChange: (layout: FreeLayout) => void;
  /** Vista inicial (pan/zoom) guardada; si se omite, fit-to-content al montar. */
  initialView?: { panX: number; panY: number; zoom: number };
  /** Se invoca (debounced 500 ms) cuando el usuario cambia la vista (pan/zoom). */
  onViewChange?: (view: { panX: number; panY: number; zoom: number }) => void;
  /** Handle imperativo para que el dock inferior dispare las acciones del lienzo. */
  ref?: Ref<FreeBoardHandle>;
  /** Notifica cambios en el estado que la barra externa refleja (deshacer / dibujo). */
  onCanvasMeta?: (meta: CanvasMeta) => void;
}

// Firma de contenido de una disposición (id + tipo + widget + caja + z). Detecta cambios EXTERNOS
// de `elements` (p.ej. canvas_ops del chat aplicadas al store desde el shell) e ignora el eco del
// propio `onChange`, que devuelve una disposición de contenido idéntico.
function freeElementsSig(layout: readonly FreeElement[]): string {
  return layout
    .map(
      (e) =>
        `${e.id}|${e.kind}|${'widgetId' in e ? e.widgetId : ''}|${Math.round(e.x)}|${Math.round(e.y)}|${Math.round(e.w)}|${Math.round(e.h)}|${e.z}`,
    )
    .join(';');
}

export function FreeBoard({
  elements,
  renderItem,
  itemLabel,
  onChange,
  initialView,
  onViewChange,
  ref,
  onCanvasMeta,
}: FreeBoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [els, setEls] = useState<FreeElement[]>(elements);
  const [past, setPast] = useState<FreeElement[][]>([]);
  // Pila de REHACER: estados retirados por «Deshacer», listos para reponerse. Una acción nueva
  // (mutate/commitMove/onTextBlur → pushHistory) la vacía, porque rehacer un futuro ya divergente
  // no tendría sentido.
  const [future, setFuture] = useState<FreeElement[][]>([]);
  // Captura el valor en el primer render (antes de cualquier efecto); con key={preset.id}
  // el componente remonta en cada cambio de preset, así que este ref es siempre fresco.
  const initialViewRef = useRef(initialView);
  const [view, setView] = useState<View>(
    () => initialViewRef.current ?? { panX: 0, panY: 0, zoom: 1 },
  );
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<ToolId>('select');
  // Modo de interacción del lienzo, SEPARADO de la herramienta de dibujo (`tool`):
  //  - 'select': comportamiento normal (arrastrar widgets). El fondo NO hace pan: mover la vista es
  //             deliberado (botón de la mano o barra espaciadora).
  //  - 'pan'  : MOVER explícito → arrastrar EN CUALQUIER SITIO hace pan; los widgets no se mueven
  //             (evita la confusión de mover lienzo y widget a la vez).
  //  - 'erase': GOMA → un clic en un elemento lo borra.
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan' | 'erase'>('select');
  const [drawOpen, setDrawOpen] = useState(false);
  // Barra espaciadora pulsada = pan temporal (navegar sin activar la mano). Refleja la clase para
  // el cursor; el ref lo lee el gesto sin closures viejos.
  const [spacePan, setSpacePan] = useState(false);
  const spaceHeldRef = useRef(false);
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0]!);
  const [draft, setDraft] = useState<FreeShape | FreeDraw | null>(null);
  const [emptyPaletteOpen, setEmptyPaletteOpen] = useState(false);

  // Espejos síncronos para listeners no-React (wheel) y handlers de gesto (sin closures viejos).
  const viewRef = useRef(view);
  viewRef.current = view;
  const zoomRef = useRef(view.zoom);
  zoomRef.current = view.zoom;
  const elsRef = useRef(els);
  elsRef.current = els;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // FreeBoard es la fuente de verdad de las interacciones (drag/zoom/dibujo), por eso siembra `els`
  // desde `elements` solo al montar. Pero el chat aplica canvas_ops al dashboard-store desde el
  // shell (con el lienzo montado), y eso debe verse EN VIVO. Adopta `elements` cuando su CONTENIDO
  // difiere del estado actual; compara por firma para ignorar el eco del propio `onChange` (vuelve
  // idéntico) y NO corre durante un drag (el move no emite `onChange`, así que `elements` no cambia).
  useEffect(() => {
    setEls((cur) => (freeElementsSig(cur) === freeElementsSig(elements) ? cur : elements));
  }, [elements]);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const colorRef = useRef(drawColor);
  colorRef.current = drawColor;
  const dragSnapshot = useRef<FreeElement[] | null>(null);
  const idCounter = useRef(0);

  const newId = useCallback((prefix: string): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  }, []);

  // ── Historial / persistencia ──
  const pushHistory = useCallback((snapshot: FreeElement[]): void => {
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), snapshot]);
    setFuture([]); // una acción nueva invalida la pila de rehacer
  }, []);

  const mutate = useCallback(
    (next: FreeElement[]): void => {
      pushHistory(elsRef.current);
      setEls(next);
      onChangeRef.current(next);
    },
    [pushHistory],
  );

  const undo = useCallback((): void => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      // El estado ACTUAL pasa a la pila de rehacer antes de retroceder.
      setFuture((f) => [...f.slice(-(HISTORY_MAX - 1)), elsRef.current]);
      setEls(prev);
      onChangeRef.current(prev);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback((): void => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1]!;
      // Simétrico a undo: el estado ACTUAL vuelve a la pila de deshacer antes de avanzar.
      setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), elsRef.current]);
      setEls(next);
      onChangeRef.current(next);
      return f.slice(0, -1);
    });
  }, []);

  // Centro del viewport en coordenadas de mundo (para colocar lo nuevo a la vista).
  const viewCenterWorld = useCallback((): { x: number; y: number } => {
    const el = viewportRef.current;
    const { panX, panY, zoom } = viewRef.current;
    const cx = (el?.clientWidth ?? 0) / 2;
    const cy = (el?.clientHeight ?? 0) / 2;
    return { x: (cx - panX) / zoom, y: (cy - panY) / zoom };
  }, []);

  // Pantalla → mundo a partir del rect del viewport y el pan/zoom actuales.
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const { panX, panY, zoom } = viewRef.current;
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
    },
    [],
  );

  // ── Nodos de widgets, memoizados por el CONJUNTO de ids de widget: pan/zoom/mover NO los
  // recrea (solo añadir/quitar). Notas/formas/textos se renderizan aparte. ──
  const widgetIdsKey = els
    .filter((e) => e.kind === 'widget')
    .map((e) => e.id)
    .join('|');
  const widgetNodes = useMemo(() => {
    const map = new Map<string, ReactNode>();
    for (const e of elsRef.current) {
      if (e.kind === 'widget') map.set(e.id, renderItem(e.widgetId));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIdsKey, renderItem]);

  // ── Zoom centrado (botones) / fit / reset ──
  const zoomAtCenter = useCallback((factor: number): void => {
    const el = viewportRef.current;
    if (!el) return;
    setView((v) => {
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const nz = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const wx = (cx - v.panX) / v.zoom;
      const wy = (cy - v.panY) / v.zoom;
      return { zoom: nz, panX: cx - wx * nz, panY: cy - wy * nz };
    });
  }, []);

  const reset100 = useCallback((): void => {
    const el = viewportRef.current;
    if (!el) return;
    setView((v) => {
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const wx = (cx - v.panX) / v.zoom;
      const wy = (cy - v.panY) / v.zoom;
      return { zoom: 1, panX: cx - wx, panY: cy - wy };
    });
  }, []);

  const fitToContent = useCallback((): void => {
    const el = viewportRef.current;
    const list = elsRef.current;
    if (!el || list.length === 0) return;
    const b = contentBounds(list);
    if (!b) return;
    const cw = b.maxX - b.minX;
    const ch = b.maxY - b.minY;
    if (cw <= 0 || ch <= 0) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Centrar/ajustar topa en FIT_MAX_ZOOM (85%): con contenido grande sigue alejando para que
    // quepa, pero con contenido compacto no se acerca más del 85% (antes llegaba hasta ZOOM_MAX).
    const zoom = clamp(
      Math.min((w - 2 * FIT_PADDING) / cw, (h - 2 * FIT_PADDING) / ch),
      ZOOM_MIN,
      FIT_MAX_ZOOM,
    );
    setView({
      zoom,
      panX: (w - (b.maxX + b.minX) * zoom) / 2,
      panY: (h - (b.maxY + b.minY) * zoom) / 2,
    });
  }, []);

  // Encaja el contenido al montar (si no hay vista guardada) y mide el viewport.
  useLayoutEffect(() => {
    if (!initialViewRef.current) fitToContent();
    const el = viewportRef.current;
    if (el) setViewportSize({ width: el.clientWidth, height: el.clientHeight });
  }, [fitToContent]);

  // Persiste pan/zoom debounced (500 ms) para que el padre lo guarde entre presets.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  useEffect(() => {
    const t = setTimeout(() => onViewChangeRef.current?.(view), 500);
    return () => clearTimeout(t);
  }, [view]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Rueda: ⌘/Ctrl (o pellizco de trackpad) = zoom hacia el cursor, también con el cursor sobre una
  //    nota. La rueda simple NO hace pan (mover el lienzo es deliberado: mano o barra espaciadora),
  //    PERO si el cursor está sobre el área de scroll de una nota se deja pasar para que la nota
  //    scrollee de forma nativa (si no, el lienzo le robaría la rueda). En el resto del lienzo el
  //    preventDefault mantiene la rueda «dentro» (evita el scroll de página y el atrás/adelante). ──
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const mult = e.deltaMode === 1 ? 16 : 1;
        const { panX, panY, zoom } = viewRef.current;
        const factor = Math.exp(-e.deltaY * mult * WHEEL_ZOOM_SENSITIVITY);
        const nz = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);
        const wx = (sx - panX) / zoom;
        const wy = (sy - panY) / zoom;
        setView({ zoom: nz, panX: sx - wx * nz, panY: sy - wy * nz });
        return;
      }
      // Rueda simple sobre el contenido de una nota → scroll nativo de la nota (no la secuestres).
      if ((e.target as HTMLElement | null)?.closest('.dash-free-note-scroll')) return;
      // Resto del lienzo: la rueda simple no mueve la vista, pero el lienzo se queda el evento.
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // El puntero está sobre el lienzo: condiciona el pan con barra espaciadora (no secuestrar el
  // espacio global cuando el lienzo no es el foco/hover).
  const overRef = useRef(false);

  // ── Barra espaciadora = PAN temporal: navegar el lienzo SIN activar la mano. Mientras se mantiene
  //    pulsada, arrastrar en cualquier sitio mueve el lienzo (los elementos quedan inertes vía la
  //    clase .dash-free--panning). No secuestra el espacio al escribir (inputs/editor de notas). ──
  useEffect(() => {
    const isEditable = (n: EventTarget | null): boolean => {
      const el = n as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const canPan = (): boolean =>
      overRef.current ||
      document.activeElement === viewportRef.current ||
      !!viewportRef.current?.contains(document.activeElement);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (e.repeat || isEditable(document.activeElement) || !canPan()) return;
      spaceHeldRef.current = true;
      setSpacePan(true);
      e.preventDefault(); // evita el scroll de página mientras se hace pan con espacio
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      spaceHeldRef.current = false;
      setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Gesto sobre el fondo del lienzo: creación (herramienta de dibujo). El pan NO vive aquí: solo
  //    se mueve la vista con el botón de la mano (modo 'pan') o la barra espaciadora. ──
  const panState = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const drawGesture = useRef<
    | { kind: 'pen'; points: Array<[number, number]> }
    | { kind: 'shape'; shape: ShapeKind; startX: number; startY: number }
    | null
  >(null);

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    // PAN deliberado: el lienzo SOLO se mueve con el botón de la mano (modo 'pan') o manteniendo la
    // barra espaciadora (mano temporal). En ese caso, arrastrar en CUALQUIER sitio hace pan, aunque
    // el gesto venga de un widget (su startDrag retorna en modo pan y el evento burbujea hasta
    // aquí), así no se confunde mover el lienzo con mover un widget. GOMA: no arranca gesto de fondo.
    if (interactionModeRef.current === 'pan' || spaceHeldRef.current) {
      viewportRef.current?.setPointerCapture(e.pointerId);
      const { panX, panY } = viewRef.current;
      panState.current = { x: e.clientX, y: e.clientY, panX, panY, moved: false };
      return;
    }
    if (interactionModeRef.current === 'erase') return;
    // Solo gestos que empiezan en el FONDO (los elementos paran la propagación; en modo dibujo
    // están además inertes por CSS para que el gesto llegue siempre aquí).
    if (e.target !== e.currentTarget) return;
    const t = toolRef.current;
    if (t !== 'select') {
      const w = screenToWorld(e.clientX, e.clientY);
      viewportRef.current?.setPointerCapture(e.pointerId);
      drawGesture.current =
        t === 'pen'
          ? { kind: 'pen', points: [[w.x, w.y]] }
          : { kind: 'shape', shape: t, startX: w.x, startY: w.y };
      return;
    }
    // Modo normal (select) + clic en el fondo: NO hace nada. Arrastrar el fondo ya no desplaza la
    // vista; el pan vive en el botón de la mano o en la barra espaciadora (mano temporal).
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const g = drawGesture.current;
    if (g) {
      const w = screenToWorld(e.clientX, e.clientY);
      if (g.kind === 'pen') {
        g.points.push([w.x, w.y]);
        const made = addDraw([], 'draft', g.points, colorRef.current, DRAW_STROKE_WIDTH)[0];
        setDraft((made as FreeDraw | undefined) ?? null);
      } else {
        const x = Math.min(g.startX, w.x);
        const y = Math.min(g.startY, w.y);
        const diag = (w.x - g.startX) * (w.y - g.startY) >= 0 ? 'main' : 'anti';
        const box = { x, y, w: Math.abs(w.x - g.startX), h: Math.abs(w.y - g.startY) };
        setDraft(
          addShape([], 'draft', g.shape, box, {
            stroke: colorRef.current,
            strokeWidth: DRAW_STROKE_WIDTH,
            diag,
          })[0] as FreeShape,
        );
      }
      return;
    }
    const s = panState.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
    s.moved = true;
    setView((v) => ({ ...v, panX: s.panX + dx, panY: s.panY + dy }));
  };

  const endGesture = (e: React.PointerEvent, commit: boolean): void => {
    const g = drawGesture.current;
    if (g) {
      viewportRef.current?.releasePointerCapture(e.pointerId);
      drawGesture.current = null;
      setDraft(null);
      if (!commit) return;
      const w = screenToWorld(e.clientX, e.clientY);
      if (g.kind === 'pen') {
        mutate(
          addDraw(elsRef.current, newId('draw'), g.points, colorRef.current, DRAW_STROKE_WIDTH),
        );
      } else {
        const width = Math.abs(w.x - g.startX);
        const height = Math.abs(w.y - g.startY);
        if (width >= MIN_SHAPE || height >= MIN_SHAPE) {
          const diag = (w.x - g.startX) * (w.y - g.startY) >= 0 ? 'main' : 'anti';
          mutate(
            addShape(
              elsRef.current,
              newId('shape'),
              g.shape,
              { x: Math.min(g.startX, w.x), y: Math.min(g.startY, w.y), w: width, h: height },
              { stroke: colorRef.current, strokeWidth: DRAW_STROKE_WIDTH, diag },
            ),
          );
        }
      }
      return;
    }
    if (panState.current) viewportRef.current?.releasePointerCapture(e.pointerId);
    panState.current = null;
  };
  const onPointerUp = (e: React.PointerEvent): void => endGesture(e, true);
  const onPointerCancel = (e: React.PointerEvent): void => endGesture(e, false);

  // ── Mover / enfocar (z) / quitar / editar elementos ──
  const onDragStart = useCallback((): void => {
    dragSnapshot.current = elsRef.current;
  }, []);
  const moveEl = useCallback((id: string, dx: number, dy: number): void => {
    setEls((prev) => prev.map((e) => (e.id === id ? { ...e, x: e.x + dx, y: e.y + dy } : e)));
  }, []);
  // Redimensiona una nota desde su tirador (esquina inf-derecha). Reusa onDragStart/commitMove
  // para el snapshot de deshacer y la persistencia (mismo ciclo que mover).
  const resizeEl = useCallback((id: string, dw: number, dh: number): void => {
    setEls((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, w: Math.max(NOTE_MIN_W, e.w + dw), h: Math.max(NOTE_MIN_H, e.h + dh) }
          : e,
      ),
    );
  }, []);
  const commitMove = useCallback((): void => {
    const snap = dragSnapshot.current ?? elsRef.current;
    dragSnapshot.current = null;
    pushHistory(snap);
    onChangeRef.current(elsRef.current);
  }, [pushHistory]);

  const focusEl = useCallback((id: string): void => {
    const cur = elsRef.current;
    const top = cur.reduce((m, e) => Math.max(m, e.z), -1);
    const el = cur.find((e) => e.id === id);
    if (!el || el.z === top) return;
    setEls(bringToFront(cur, id));
  }, []);

  const removeEl = useCallback(
    (id: string): void => {
      mutate(removeElement(elsRef.current, id));
    },
    [mutate],
  );

  const onNoteChange = useCallback(
    (id: string, doc: unknown): void => {
      mutate(updateElement(elsRef.current, id, { doc }));
    },
    [mutate],
  );

  // Texto libre: durante la escritura solo se actualiza el estado LOCAL; al salir del foco se
  // persiste una vez (y se descarta el texto vacío). El snapshot de deshacer se toma al empezar.
  const onTextEditStart = useCallback((): void => {
    dragSnapshot.current = elsRef.current;
  }, []);
  const onTextChange = useCallback((id: string, text: string): void => {
    setEls((prev) => updateElement(prev, id, { text }));
  }, []);
  const onTextBlur = useCallback(
    (id: string): void => {
      const el = elsRef.current.find((e) => e.id === id);
      if (el && el.kind === 'text' && el.text.trim() === '') {
        const next = removeElement(elsRef.current, id);
        dragSnapshot.current = null;
        setEls(next);
        onChangeRef.current(next);
        return;
      }
      pushHistory(dragSnapshot.current ?? elsRef.current);
      dragSnapshot.current = null;
      onChangeRef.current(elsRef.current);
    },
    [pushHistory],
  );

  // ── Acciones de toolbar ──
  const onAddWidget = useCallback(
    (widgetId: string): void => {
      mutate(addWidget(elsRef.current, widgetId, viewCenterWorld()));
    },
    [mutate, viewCenterWorld],
  );
  const onAddNote = useCallback((): void => {
    mutate(addNote(elsRef.current, newId('note'), viewCenterWorld()));
  }, [mutate, viewCenterWorld, newId]);
  // Texto libre desde botón (no por clic en el lienzo): se crea centrado y entra en edición.
  // Crearlo desde un botón evita que el lienzo (tabIndex) robe el foco y borre el texto vacío.
  const onAddText = useCallback((): void => {
    const center = viewCenterWorld();
    mutate(
      addText(
        elsRef.current,
        newId('text'),
        { x: center.x - 110, y: center.y - 20 },
        colorRef.current,
      ),
    );
  }, [mutate, viewCenterWorld, newId]);
  // Abre/cierra el pill de dibujo. Al abrir activa el lápiz; al cerrar vuelve a seleccionar.
  const toggleDraw = useCallback((): void => {
    setDrawOpen((open) => {
      const next = !open;
      setTool(next ? 'pen' : 'select');
      // Dibujar es excluyente con MOVER/GOMA: al abrir el dibujo, sal de esos modos.
      if (next) setInteractionMode('select');
      return next;
    });
  }, []);
  const onArrange = useCallback((): void => {
    mutate(autoArrangeFree(elsRef.current));
    requestAnimationFrame(() => fitToContent());
  }, [mutate, fitToContent]);

  // ── Teclado en el fondo: flechas = pan, +/− = zoom, 0 = 100%, f = ajustar, Esc = seleccionar. ──
  const onViewportKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowLeft':
        setView((v) => ({ ...v, panX: v.panX + KEY_PAN }));
        break;
      case 'ArrowRight':
        setView((v) => ({ ...v, panX: v.panX - KEY_PAN }));
        break;
      case 'ArrowUp':
        setView((v) => ({ ...v, panY: v.panY + KEY_PAN }));
        break;
      case 'ArrowDown':
        setView((v) => ({ ...v, panY: v.panY - KEY_PAN }));
        break;
      case '+':
      case '=':
        zoomAtCenter(ZOOM_STEP);
        break;
      case '-':
        zoomAtCenter(1 / ZOOM_STEP);
        break;
      case '0':
        reset100();
        break;
      case 'f':
        fitToContent();
        break;
      case 'Escape':
        setTool('select');
        setDrawOpen(false);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const zoomPct = Math.round(view.zoom * 100);
  const ordered = [...els].sort((a, b) => a.z - b.z);
  const available = availableWidgets(els);
  const drawing = tool !== 'select';

  // ── Puente con la barra inferior externa (dock): handle imperativo + meta reactiva. ──
  const onSetMode = useCallback((m: InteractionMode): void => {
    setInteractionMode(m);
    // MOVER/GOMA y dibujo son excluyentes: al activar un modo, cierra el dibujo y vuelve a 'select'.
    if (m !== 'select') {
      setTool('select');
      setDrawOpen(false);
    }
  }, []);
  useImperativeHandle(
    ref,
    (): FreeBoardHandle => ({
      addWidget: onAddWidget,
      addNote: onAddNote,
      addText: onAddText,
      toggleDraw,
      undo,
      redo,
      arrange: onArrange,
      setMode: onSetMode,
      listWidgets: () =>
        availableWidgets(elsRef.current).map((id) => ({ id, label: itemLabel(id) })),
      zoomIn: () => zoomAtCenter(ZOOM_STEP),
      zoomOut: () => zoomAtCenter(1 / ZOOM_STEP),
      resetZoom: reset100,
      fitZoom: fitToContent,
    }),
    [
      onAddWidget,
      onAddNote,
      onAddText,
      toggleDraw,
      undo,
      redo,
      onArrange,
      onSetMode,
      itemLabel,
      zoomAtCenter,
      reset100,
      fitToContent,
    ],
  );
  useEffect(() => {
    onCanvasMeta?.({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      drawOpen,
      mode: interactionMode,
      zoomPct,
    });
  }, [past.length, future.length, drawOpen, interactionMode, zoomPct, onCanvasMeta]);

  // Entrada con rebote escalonado de los bloques (widget/nota) recién añadidos —a mano o por el
  // agente—. Las formas/dibujos/textos a mano se quedan donde se trazan (sin rebote).
  const blockIds = els.filter((e) => e.kind === 'widget' || e.kind === 'note').map((e) => e.id);
  useEnterAnimation(blockIds, () => viewportRef.current);

  // Minimapa + flecha de orientación (solo con viewport medido y algún elemento).
  const hasViewport = viewportSize.width > 0 && viewportSize.height > 0;
  const projection =
    hasViewport && els.length > 0 ? minimapProjection(els, view, viewportSize, MINIMAP_SIZE) : null;
  const arrow =
    hasViewport && els.length > 0 ? offscreenArrow(contentBounds(els), view, viewportSize) : null;

  const onMinimapNavigate = (miniX: number, miniY: number): void => {
    if (!projection) return;
    setView((v) => ({ ...v, ...minimapClickToPan(projection, miniX, miniY, v, viewportSize) }));
  };

  const labelFor = (el: FreeElement): string => {
    switch (el.kind) {
      case 'widget':
        return itemLabel(el.widgetId);
      case 'note':
        return 'Nota';
      case 'text':
        return 'Texto';
      case 'draw':
        return 'Dibujo';
      default:
        return 'Forma';
    }
  };

  return (
    <div className="dash-free-shell">
      {/* Pill horizontal de herramientas de dibujo, encima de la barra inferior (al pulsar Dibujar). */}
      {drawOpen && (
        <div
          className="dash-free-draw-pill"
          data-testid="dash-free-draw-pill"
          role="toolbar"
          aria-label="Herramientas de dibujo"
        >
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dash-free-tool-btn${tool === t.id ? ' is-active' : ''}`}
              data-testid={`dash-free-tool-${t.id}`}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              title={t.label}
              onClick={() => setTool(t.id)}
            >
              <t.Icon size={17} aria-hidden="true" />
            </button>
          ))}
          <span className="dash-free-tools-sep" aria-hidden="true" />
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`dash-free-swatch${drawColor === c ? ' is-active' : ''}`}
              data-testid={`dash-free-color-${c.replace('#', '')}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={drawColor === c}
              title={`Color ${c}`}
              onClick={() => setDrawColor(c)}
            />
          ))}
        </div>
      )}

      {/* Las acciones del lienzo (widget/nota/texto/dibujar/deshacer/ordenar) viven ahora en
          el dock inferior unificado del dashboard, junto al input del asistente. Se disparan
          vía el handle imperativo (FreeBoardHandle). El pill de dibujo sigue aquí porque sus
          subherramientas dependen del estado interno del lienzo. */}

      <div
        ref={viewportRef}
        className={`dash-free${drawing ? ' dash-free--drawing' : ''}${
          interactionMode === 'pan' || spacePan ? ' dash-free--panning' : ''
        }${interactionMode === 'erase' ? ' dash-free--erasing' : ''}`}
        data-testid="dash-free"
        tabIndex={0}
        role="application"
        aria-label="Lienzo libre · usa el botón de la mano o mantén la barra espaciadora y arrastra para mover la vista; ⌘/Ctrl+rueda para hacer zoom"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={() => {
          overRef.current = true;
        }}
        onPointerLeave={() => {
          overRef.current = false;
        }}
        onKeyDown={onViewportKeyDown}
      >
        {/* Capa de puntos, en su propio plano para poder animarla (ola + rebote) al cambiar de modo
            sin afectar a los widgets del mundo. Sigue al pan/zoom vía background-size/position. */}
        <div
          className="dash-free-dots"
          aria-hidden="true"
          style={
            {
              // pan/zoom como custom props para que la capa base Y la cresta (::after) compartan
              // exactamente la misma rejilla durante la ola diagonal (ver dashboard.css).
              '--dots-size': `${24 * view.zoom}px`,
              '--dots-pos-x': `${view.panX}px`,
              '--dots-pos-y': `${view.panY}px`,
            } as React.CSSProperties
          }
        />
        <div
          className="dash-free-world"
          style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
        >
          {ordered.map((el) => (
            <ElementView
              key={el.id}
              el={el}
              zoomRef={zoomRef}
              interactionMode={interactionMode}
              label={labelFor(el)}
              onDragStart={onDragStart}
              onMove={moveEl}
              onResize={resizeEl}
              onCommit={commitMove}
              onFocus={focusEl}
              onRemove={removeEl}
              onTextEditStart={onTextEditStart}
              onTextChange={onTextChange}
              onTextBlur={onTextBlur}
            >
              {el.kind === 'widget' ? (
                widgetNodes.get(el.id)
              ) : el.kind === 'note' ? (
                <FreeNote doc={el.doc} onChange={(doc) => onNoteChange(el.id, doc)} />
              ) : null}
            </ElementView>
          ))}

          {/* Vista previa del elemento en curso de dibujo. */}
          {draft && (
            <div
              className="dash-free-item dash-free-draft"
              style={{
                transform: `translate(${draft.x}px, ${draft.y}px)`,
                width: draft.w,
                height: draft.h,
              }}
              aria-hidden="true"
            >
              <div className="dash-free-item-body">
                <FreeShapeView el={draft} />
              </div>
            </div>
          )}
        </div>

        {/* Flecha de orientación off-screen: persiste mientras el contenido no se vea. */}
        {arrow && (
          <button
            type="button"
            className={`dash-free-arrow dash-free-arrow--${arrow.edge}`}
            data-testid="dash-free-arrow"
            aria-label="Volver al dashboard"
            title="Volver al dashboard"
            onClick={() => fitToContent()}
            style={{ left: arrow.x, top: arrow.y, transform: `rotate(${arrow.angle}deg)` }}
          />
        )}

        {/* Minimapa (esquina del lienzo). */}
        {projection && (
          <FreeMinimap projection={projection} size={MINIMAP_SIZE} onNavigate={onMinimapNavigate} />
        )}
      </div>
    </div>
  );
}

interface ElementViewProps {
  el: FreeElement;
  zoomRef: RefObject<number>;
  interactionMode: InteractionMode;
  label: string;
  onDragStart: () => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, dw: number, dh: number) => void;
  onCommit: () => void;
  onFocus: (id: string) => void;
  onRemove: (id: string) => void;
  onTextEditStart: () => void;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: (id: string) => void;
  children: ReactNode;
}

// Elemento del lienzo. WIDGETS/FORMAS/DIBUJOS: cuerpo inerte, se arrastra por cualquier parte.
// NOTAS: cuerpo interactivo, se arrastra por la cabecera. TEXTO: arrastrable; doble clic edita.
// Memoizado: solo se re-renderiza si cambia SU estado, no al hacer pan/zoom del lienzo.
const ElementView = memo(function ElementView({
  el,
  zoomRef,
  interactionMode,
  label,
  onDragStart,
  onMove,
  onResize,
  onCommit,
  onFocus,
  onRemove,
  onTextEditStart,
  onTextChange,
  onTextBlur,
  children,
}: ElementViewProps) {
  const drag = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [editingText, setEditingText] = useState(el.kind === 'text' && el.text === '');

  // Un texto recién creado (vacío) entra directamente en edición.
  useEffect(() => {
    if (el.kind === 'text' && el.text === '') onTextEditStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = (e: React.PointerEvent): void => {
    // MOVER (pan): NO arranques el drag del elemento ni pares la propagación → el evento burbujea
    // al fondo y hace pan. Así arrastrar sobre un widget mueve el LIENZO, no el widget.
    if (interactionMode === 'pan') return;
    // GOMA: un clic izquierdo borra el elemento.
    if (interactionMode === 'erase') {
      e.stopPropagation();
      if (e.button === 0) onRemove(el.id);
      return;
    }
    e.stopPropagation(); // no arranques el pan del fondo
    if (e.button !== 0) return;
    onFocus(el.id);
    // NO capturamos el puntero aquí: capturarlo en pointerdown le roba el click/hover a los
    // controles interactivos del widget (toggles, barras). Se captura al confirmar el arrastre (al
    // superar el umbral en moveDrag), igual que los chips de sugerencia. Un click sin mover pasa
    // limpio al hijo.
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };
  const moveDrag = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const z = zoomRef.current || 1;
    if (!d.moved) {
      // Bajo el umbral aún es un click (no un arrastre): no muevas ni captures → el control del
      // widget recibe su evento.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      onDragStart();
      e.currentTarget.setPointerCapture(e.pointerId); // ahora sí: arrastre real
      d.moved = true;
    }
    onMove(el.id, (e.clientX - d.x) / z, (e.clientY - d.y) / z);
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const endDrag = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (d?.moved && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    if (d?.moved) onCommit();
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_MOVE, 0],
      ArrowRight: [KEY_MOVE, 0],
      ArrowUp: [0, -KEY_MOVE],
      ArrowDown: [0, KEY_MOVE],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart();
    onMove(el.id, m[0], m[1]);
    onCommit();
  };

  const dragHandlers = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  // ── Redimensión (tirador esquina inf-derecha de la nota): mismo ciclo que el arrastre, pero
  // cambia w/h en vez de x/y. Snapshot/commit reutilizan onDragStart/onCommit. ──
  const resize = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const startResize = (e: React.PointerEvent): void => {
    e.stopPropagation(); // no arranques el drag de la cabecera ni el pan del fondo
    if (e.button !== 0) return;
    onFocus(el.id);
    resize.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const moveResize = (e: React.PointerEvent): void => {
    const r = resize.current;
    if (!r) return;
    const z = zoomRef.current || 1;
    if (!r.moved) {
      if (Math.hypot(e.clientX - r.x, e.clientY - r.y) < DRAG_THRESHOLD_PX) return;
      onDragStart();
      e.currentTarget.setPointerCapture(e.pointerId);
      r.moved = true;
    }
    onResize(el.id, (e.clientX - r.x) / z, (e.clientY - r.y) / z);
    r.x = e.clientX;
    r.y = e.clientY;
  };
  const endResize = (e: React.PointerEvent): void => {
    const r = resize.current;
    if (r?.moved && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resize.current = null;
    if (r?.moved) onCommit();
  };
  const resizeHandlers = {
    onPointerDown: startResize,
    onPointerMove: moveResize,
    onPointerUp: endResize,
    onPointerCancel: endResize,
  };

  const removeBtn = (
    <button
      type="button"
      className="dash-free-remove"
      data-testid={`dash-free-remove-${el.id}`}
      aria-label={`Quitar ${label}`}
      title="Quitar"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onRemove(el.id);
      }}
    >
      <X size={13} aria-hidden="true" />
    </button>
  );

  // ── Nota: cabecera arrastrable + cuerpo interactivo (editor). ──
  if (el.kind === 'note') {
    return (
      <div
        className="dash-free-item dash-free-item--note"
        style={{
          transform: `translate(${el.x}px, ${el.y}px)`,
          width: el.w,
          height: el.h,
          zIndex: el.z,
          ...(el.color ? { background: el.color } : null),
        }}
        role="group"
        aria-label={label}
        data-board-item={el.id}
        onPointerDownCapture={() => onFocus(el.id)}
        onPointerDown={(e) => {
          // GOMA: un clic en cualquier parte de la nota la borra. Sus hijos van inertes por CSS
          // (.dash-free--erasing .dash-free-item *), así que el wrapper recibe el clic; ya no hay «×».
          if (interactionMode === 'erase' && e.button === 0) {
            e.stopPropagation();
            onRemove(el.id);
          }
        }}
      >
        <div
          className="dash-free-note-header"
          {...dragHandlers}
          onKeyDown={onKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`${label}. Arrastra para mover; usa las flechas para ajustar.`}
        >
          <span className="dash-free-note-grip" aria-hidden="true" />
        </div>
        <div className="dash-free-note-body">{children}</div>
        {/* Tirador de redimensión (esquina inf-derecha). El contenido del editor ya hace scroll. */}
        <span
          className="dash-free-note-resize"
          {...resizeHandlers}
          aria-hidden="true"
          title="Redimensionar"
        />
      </div>
    );
  }

  // ── Texto libre: arrastrable cuando NO se edita; doble clic entra en edición. ──
  if (el.kind === 'text') {
    return (
      <div
        className={`dash-free-item dash-free-item--text${editingText ? ' is-editing' : ''}`}
        style={{
          transform: `translate(${el.x}px, ${el.y}px)`,
          width: el.w,
          minHeight: el.h,
          zIndex: el.z,
        }}
        role="group"
        aria-label={label}
        tabIndex={0}
        data-board-item={el.id}
        onPointerDownCapture={() => onFocus(el.id)}
        onDoubleClick={() => {
          onTextEditStart();
          setEditingText(true);
        }}
        {...(editingText ? {} : { ...dragHandlers, onKeyDown })}
      >
        {removeBtn}
        <FreeText
          el={el}
          editing={editingText}
          onChange={(text) => onTextChange(el.id, text)}
          onBlur={() => {
            setEditingText(false);
            onTextBlur(el.id);
          }}
        />
      </div>
    );
  }

  // ── Widget / forma / dibujo: cuerpo inerte, arrastre por toda la caja. ──
  const body = el.kind === 'shape' || el.kind === 'draw' ? <FreeShapeView el={el} /> : children;

  return (
    <div
      className={`dash-free-item dash-free-item--${el.kind}`}
      style={{
        transform: `translate(${el.x}px, ${el.y}px)`,
        width: el.w,
        height: el.h,
        zIndex: el.z,
      }}
      {...dragHandlers}
      onKeyDown={onKeyDown}
      role="group"
      tabIndex={0}
      aria-label={`${label}. Usa las flechas para moverla.`}
      data-board-item={el.id}
    >
      {removeBtn}
      <div className="dash-free-item-body">{body}</div>
    </div>
  );
});
