// Store Zustand del dashboard (F4.1, EPIC #188). Fuente de verdad de la disposición del
// lienzo (`layout`) y del modo de edición (`editing`), para que tanto DashboardPage como el
// ChatPanel del agente operen sobre el mismo estado sin pasar props por la página.
//
// `usePreferences` queda como capa de persistencia DEBAJO: el store sincroniza con
// `setPref('dashboard.layout', …)` mediante un persister inyectado por DashboardPage al montar
// (la mutación vive en un hook de React) y con DEBOUNCE de 500ms — evita una tormenta de PUTs
// que se pisarían por red cuando el agente coloca varios widgets en un mismo turno.
//
// `layout.genericWidgets` es la ÚNICA fuente de verdad de los widgets genéricos; el store no
// la duplica como campo top-level (evita desincronización). `editing` es estado puramente UI.

import { create } from 'zustand';

import { registerGenericWidget, unregisterGenericWidget } from '../widgets/registry.js';
import type { CanvasOp } from './chat.js';
import {
  addGenericToFree,
  addNote as addNoteEl,
  addShape as addShapeEl,
  addText as addTextEl,
  addWidget as addWidgetToFree,
  addWidgetToGrid,
  autoArrangeFree,
  type DashboardMode,
  DRAW_COLORS,
  DRAW_STROKE_WIDTH,
  type FreeLayout,
  GENERIC_DEFAULT_SIZE,
  type GenericSpec,
  type GenericWidgetType,
  ITEM_SPECS,
  type LayoutPref,
  type PresetId,
  removeElement as removeElementEl,
  type SemanticPosition,
  type ShapeKind,
  type StoredLayouts,
} from './dashboard-layout.js';

// Único preset activo tras la migración F0 (#174). Todas las operaciones de lienzo escriben
// en este preset; los presets antiguos quedan en `layout` por legacy pero no se editan.
const ACTIVE_PRESET: PresetId = 'personalizado';

// Resultado de aplicar una operación de lienzo. El ChatPanel (F4.2) reenvía `{accepted,reason}`
// al backend vía `reportCanvasResult` (tanto si acepta como si rechaza) para desbloquear el
// bucle de tool-calling del agente e inyectar el `tool_result` correcto en el LLM.
export interface CanvasResult {
  accepted: boolean;
  reason?: string;
}

const ACCEPTED: CanvasResult = { accepted: true };
function rejected(reason: string): CanvasResult {
  return { accepted: false, reason };
}

// ── Persistencia con debounce ──────────────────────────────────────────────────
// El persister real (setPref) lo inyecta DashboardPage tras montar. El store debouncea las
// escrituras: reprograma un único PUT con el snapshot más reciente del layout.
type Persister = (layout: LayoutPref) => void;
const DEBOUNCE_MS = 500;
let persistFn: Persister | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(layout: LayoutPref): void {
  if (!persistFn) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  const fn = persistFn;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    fn(layout);
  }, DEBOUNCE_MS);
}

// ── Traducción de posición semántica (modo libre) ──────────────────────────────
// Mapeo simple posición → coords de mundo para sembrar el lienzo. F4.2 lo refina con el
// centro real del viewport y offset anti-solape; aquí basta una rejilla fija de anclas.
const FREE_ANCHORS: Record<SemanticPosition, { x: number; y: number }> = {
  'top-left': { x: 240, y: 200 },
  'top-center': { x: 700, y: 200 },
  'top-right': { x: 1160, y: 200 },
  center: { x: 700, y: 520 },
  'bottom-left': { x: 240, y: 840 },
  'bottom-center': { x: 700, y: 840 },
  'bottom-right': { x: 1160, y: 840 },
};
const SEMANTIC_POSITIONS = new Set<string>(Object.keys(FREE_ANCHORS));
function asPosition(position: string | undefined): SemanticPosition {
  return position && SEMANTIC_POSITIONS.has(position) ? (position as SemanticPosition) : 'top-left';
}
function freeAnchor(position: string | undefined): { x: number; y: number } {
  return FREE_ANCHORS[asPosition(position)];
}

const GENERIC_TYPES = new Set<GenericWidgetType>([
  'table',
  'bar',
  'line',
  'area',
  'stacked',
  'pie',
  'donut',
  'kpi',
  'insight',
]);
function asGenericType(type: string | undefined): GenericWidgetType | null {
  return type && GENERIC_TYPES.has(type as GenericWidgetType) ? (type as GenericWidgetType) : null;
}

const SHAPE_KINDS = new Set<ShapeKind>(['rect', 'ellipse', 'line', 'arrow']);

// ── Helpers de escritura inmutable sobre el preset activo ──────────────────────
function modeOf(layout: LayoutPref): DashboardMode {
  return layout.mode ?? 'grid';
}
function freeOf(layout: LayoutPref): FreeLayout {
  return layout.freeLayouts?.[ACTIVE_PRESET] ?? [];
}
function withFree(layout: LayoutPref, next: FreeLayout): LayoutPref {
  return { ...layout, freeLayouts: { ...layout.freeLayouts, [ACTIVE_PRESET]: next } };
}
function gridOf(layout: LayoutPref): StoredLayouts {
  return layout.layouts?.[ACTIVE_PRESET] ?? {};
}
function withGrid(layout: LayoutPref, next: StoredLayouts): LayoutPref {
  return { ...layout, layouts: { ...layout.layouts, [ACTIVE_PRESET]: next } };
}

// Coloca un widget genérico (ya registrado) en el preset activo según el modo. Devuelve el
// nuevo `layout` con el spec persistido en `genericWidgets`.
function placeGeneric(
  layout: LayoutPref,
  id: string,
  spec: GenericSpec,
  position: string | undefined,
): LayoutPref {
  const genericWidgets = { ...layout.genericWidgets, [id]: spec };
  if (modeOf(layout) === 'free') {
    const next = addGenericToFree(freeOf(layout), id, freeAnchor(position), spec.defaultSize);
    return { ...withFree(layout, next), genericWidgets };
  }
  const next = addWidgetToGrid(gridOf(layout), id, spec.defaultSize, asPosition(position));
  return { ...withGrid(layout, next), genericWidgets };
}

// Normaliza el `genericSpec` que envía el agente (CanvasOp, campos laxos) al `GenericSpec`
// persistido (campos estrictos). Devuelve null si el tipo no es válido.
// NOTA(F5): la validación del endpoint contra la allowlist se añade en Fase 5.
function normalizeGenericSpec(raw: NonNullable<CanvasOp['genericSpec']>): GenericSpec | null {
  const type = asGenericType(raw.type);
  if (!type) return null;
  return {
    type,
    endpoint: raw.endpoint,
    title: raw.title ?? 'Widget',
    defaultSize: raw.defaultSize ?? GENERIC_DEFAULT_SIZE[type],
    ...(raw.params ? { params: raw.params } : {}),
    ...(raw.fields ? { fields: Object.values(raw.fields) } : {}),
  };
}

export interface DashboardState {
  /** Disposición persistida del dashboard (modo, layouts grid/libre, genéricos). */
  layout: LayoutPref;
  /** Modo «Personalizar» (tablero arrastrable). Estado puramente UI, no se persiste. */
  editing: boolean;
  /** True una vez sembrado desde las preferencias del servidor (evita re-hidratar). */
  hydrated: boolean;
}

export interface DashboardActions {
  // ── Puente de persistencia (lo usa DashboardPage) ──
  /** Siembra el layout desde el servidor SIN persistir y marca el store como hidratado. */
  hydrate: (layout: LayoutPref) => void;
  /** Inyecta (o limpia) el destino de persistencia con debounce. */
  setPersister: (fn: Persister | null) => void;
  /** Fuerza el PUT pendiente ahora mismo (cancela el debounce). */
  flushPersist: () => void;
  /** Reemplaza el layout completo y programa la persistencia con debounce. */
  setLayout: (next: LayoutPref) => void;
  // ── Estado UI ──
  setEditing: (editing: boolean) => void;
  // ── Operaciones de lienzo (devuelven {accepted, reason}) ──
  setMode: (mode: DashboardMode) => CanvasResult;
  addWidget: (widgetId: string, position?: string) => CanvasResult;
  removeElement: (elementId: string) => CanvasResult;
  removeWidget: (widgetId: string) => CanvasResult;
  clearCanvas: () => CanvasResult;
  arrange: () => CanvasResult;
  addShape: (kind: string, position?: string) => CanvasResult;
  addText: (text: string, position?: string) => CanvasResult;
  addNote: (text: string, position?: string) => CanvasResult;
  addInsight: (content: string, title?: string, position?: string) => CanvasResult;
  /** Despacha una operación del agente a la acción correspondiente. */
  applyCanvasOp: (op: CanvasOp) => CanvasResult;
}

export type DashboardStore = DashboardState & DashboardActions;

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  layout: {},
  editing: false,
  hydrated: false,

  hydrate: (layout) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    set({ layout, hydrated: true });
  },
  setPersister: (fn) => {
    persistFn = fn;
  },
  flushPersist: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    persistFn?.(get().layout);
  },
  setLayout: (next) => {
    set({ layout: next });
    schedulePersist(next);
  },

  setEditing: (editing) => set({ editing }),

  setMode: (mode) => {
    const { layout } = get();
    // Al cambiar de modo salimos de «Personalizar» (la edición arrastrable no aplica en Libre).
    set({ editing: false });
    get().setLayout({ ...layout, mode });
    return ACCEPTED;
  },

  addWidget: (widgetId, position) => {
    const { layout } = get();
    if (!(widgetId in ITEM_SPECS)) {
      return rejected(`widgetId desconocido: ${widgetId}`);
    }
    if (modeOf(layout) === 'free') {
      const free = freeOf(layout);
      const next = addWidgetToFree(free, widgetId, freeAnchor(position));
      if (next === free) return rejected(`el widget ya está en el lienzo: ${widgetId}`);
      get().setLayout(withFree(layout, next));
    } else {
      const size = ITEM_SPECS[widgetId]!;
      const next = addWidgetToGrid(gridOf(layout), widgetId, size, asPosition(position));
      get().setLayout(withGrid(layout, next));
    }
    return ACCEPTED;
  },

  removeElement: (elementId) => {
    const { layout } = get();
    const free = freeOf(layout);
    const nextFree = removeElementEl(free, elementId);
    const grid = layout.layouts?.[ACTIVE_PRESET];
    let nextGrid: StoredLayouts | undefined = grid;
    let gridChanged = false;
    if (grid) {
      nextGrid = {};
      for (const [bp, items] of Object.entries(grid)) {
        const filtered = items.filter((it) => it.i !== elementId);
        if (filtered.length !== items.length) gridChanged = true;
        nextGrid[bp] = filtered;
      }
    }
    const inGeneric = elementId in (layout.genericWidgets ?? {});
    if (nextFree.length === free.length && !gridChanged && !inGeneric) {
      return rejected(`elemento no encontrado: ${elementId}`);
    }
    let next: LayoutPref = { ...layout };
    if (nextFree.length !== free.length) next = withFree(next, nextFree);
    if (gridChanged && nextGrid) next = withGrid(next, nextGrid);
    if (inGeneric) {
      const genericWidgets = { ...next.genericWidgets };
      delete genericWidgets[elementId];
      next = { ...next, genericWidgets };
      unregisterGenericWidget(elementId);
    }
    get().setLayout(next);
    return ACCEPTED;
  },

  removeWidget: (widgetId) => get().removeElement(widgetId),

  clearCanvas: () => {
    const { layout } = get();
    // Desregistra los genéricos del registry vivo antes de vaciar.
    for (const id of Object.keys(layout.genericWidgets ?? {})) unregisterGenericWidget(id);
    get().setLayout({
      ...layout,
      layouts: { ...layout.layouts, [ACTIVE_PRESET]: {} },
      freeLayouts: { ...layout.freeLayouts, [ACTIVE_PRESET]: [] },
      genericWidgets: {},
    });
    return ACCEPTED;
  },

  arrange: () => {
    const { layout } = get();
    // El auto-arreglo solo aplica al lienzo libre; en Cuadrícula es un no-op aceptado (RGL ya
    // mantiene su propio empaquetado).
    if (modeOf(layout) !== 'free') return ACCEPTED;
    get().setLayout(withFree(layout, autoArrangeFree(freeOf(layout))));
    return ACCEPTED;
  },

  addShape: (kind, position) => {
    const { layout } = get();
    if (modeOf(layout) !== 'free') return rejected('las formas solo se dibujan en modo Libre');
    if (!SHAPE_KINDS.has(kind as ShapeKind)) return rejected(`forma desconocida: ${kind}`);
    const shape = kind as ShapeKind;
    const at = freeAnchor(position);
    const box = { x: at.x, y: at.y, w: 220, h: 140 };
    const opts =
      shape === 'line' || shape === 'arrow'
        ? { stroke: DRAW_COLORS[0]!, strokeWidth: DRAW_STROKE_WIDTH, diag: 'main' as const }
        : { stroke: DRAW_COLORS[0]!, strokeWidth: DRAW_STROKE_WIDTH };
    const next = addShapeEl(freeOf(layout), crypto.randomUUID(), shape, box, opts);
    get().setLayout(withFree(layout, next));
    return ACCEPTED;
  },

  addText: (text, position) => {
    const { layout } = get();
    if (modeOf(layout) !== 'free') return rejected('el texto solo se añade en modo Libre');
    const next = addTextEl(
      freeOf(layout),
      crypto.randomUUID(),
      freeAnchor(position),
      DRAW_COLORS[0]!,
    );
    // El helper crea el texto vacío; aplica el contenido del agente si lo hay.
    const withContent = text
      ? next.map((e) => (e.kind === 'text' && e.text === '' ? { ...e, text } : e))
      : next;
    get().setLayout(withFree(layout, withContent));
    return ACCEPTED;
  },

  addNote: (text, position) => {
    const { layout } = get();
    if (modeOf(layout) !== 'free') return rejected('las notas solo se añaden en modo Libre');
    const next = addNoteEl(freeOf(layout), crypto.randomUUID(), freeAnchor(position));
    // NOTA(F4.2): el `text` del agente se vuelca a un doc TipTap; aquí se crea la nota vacía.
    void text;
    get().setLayout(withFree(layout, next));
    return ACCEPTED;
  },

  addInsight: (content, title, position) => {
    const { layout } = get();
    const id = `gen:${crypto.randomUUID()}`;
    const spec: GenericSpec = {
      type: 'insight',
      endpoint: '',
      title: title ?? 'Insight',
      defaultSize: GENERIC_DEFAULT_SIZE.insight,
      params: { markdown: content },
    };
    registerGenericWidget(id, spec);
    get().setLayout(placeGeneric(layout, id, spec, position));
    return ACCEPTED;
  },

  applyCanvasOp: (op) => {
    switch (op.op) {
      case 'add_widget': {
        if (op.genericSpec) {
          const spec = normalizeGenericSpec(op.genericSpec);
          if (!spec) return rejected(`tipo de widget genérico no válido: ${op.genericSpec.type}`);
          const id = `gen:${crypto.randomUUID()}`;
          registerGenericWidget(id, spec);
          get().setLayout(placeGeneric(get().layout, id, spec, op.position));
          return ACCEPTED;
        }
        if (!op.widgetId) return rejected('add_widget sin widgetId');
        return get().addWidget(op.widgetId, op.position);
      }
      case 'add_shape':
        return get().addShape(op.kind ?? 'rect', op.position);
      case 'add_text':
        return get().addText(op.text ?? op.content ?? '', op.position);
      case 'add_note':
        return get().addNote(op.text ?? op.content ?? '', op.position);
      case 'add_insight':
        return get().addInsight(op.content ?? op.text ?? '', undefined, op.position);
      case 'remove_element':
        if (!op.elementId) return rejected('remove_element sin elementId');
        return get().removeElement(op.elementId);
      case 'arrange':
        return get().arrange();
      case 'set_mode':
        if (!op.mode) return rejected('set_mode sin mode');
        return get().setMode(op.mode);
      case 'clear_canvas':
        return get().clearCanvas();
      default:
        return rejected(`operación desconocida: ${(op as CanvasOp).op}`);
    }
  },
}));
