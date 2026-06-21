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

import {
  getWidgetLabel,
  registerGenericWidget,
  unregisterGenericWidget,
} from '../widgets/registry.js';
import type { CanvasOp } from './chat.js';
import {
  addGenericToFree,
  addNote as addNoteEl,
  addShape as addShapeEl,
  addText as addTextEl,
  addWidget as addWidgetToFree,
  autoArrangeFree,
  type CompositeNode,
  DRAW_COLORS,
  DRAW_STROKE_WIDTH,
  type FreeElement,
  type FreeLayout,
  GENERIC_DEFAULT_SIZE,
  type GenericSpec,
  type GenericWidgetType,
  ITEM_SPECS,
  type LayoutPref,
  MAX_COMPOSITE_DEPTH,
  MAX_COMPOSITE_LEAVES,
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

// Gate CRÍTICO: NO persistir hasta haber hidratado desde el servidor (fuente de verdad:
// `state.hydrated`). El layout inicial es `{}`; persistirlo antes de hidratar PISA el layout
// bueno con un objeto vacío. Pasa en dev por `StrictMode` (monta→desmonta→monta): el cleanup del
// persister llama `flushPersist` en el desmontaje, cuando `layout` aún es `{}` y la hidratación
// (asíncrona) no ha corrido → `PUT {}` borraba todos los widgets al refrescar.
function persistEnabled(): boolean {
  return useDashboardStore.getState().hydrated;
}

function schedulePersist(layout: LayoutPref): void {
  if (!persistFn || !persistEnabled()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  const fn = persistFn;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    fn(layout);
  }, DEBOUNCE_MS);
}

// ── Traducción de posición semántica (modo libre) ──────────────────────────────
// Mapeo posición → coords de mundo para sembrar el lienzo. El centro EXACTO del viewport
// (pan/zoom de FreeBoard) no lo conoce el store; estas anclas fijas son una aproximación
// estable y el offset anti-solape (`freeSlot`) escalona los elementos que caen en la misma
// ancla durante un turno (el agente coloca varios). #188 F4.2.
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

// Distancia (px) bajo la cual se considera que dos elementos «se apilan» en la misma ancla,
// y el paso diagonal con el que se escalonan para que no queden uno encima de otro.
const FREE_NEAR_PX = 120;
const FREE_STEP_PX = 36;

// Desplaza el ancla en diagonal según cuántos elementos ya están cerca de ella, evitando que
// varios elementos colocados en la misma posición durante un turno queden superpuestos.
function freeSlot(layout: FreeLayout, anchor: { x: number; y: number }): { x: number; y: number } {
  const near = layout.filter(
    (e) =>
      Math.abs(e.x + e.w / 2 - anchor.x) < FREE_NEAR_PX &&
      Math.abs(e.y + e.h / 2 - anchor.y) < FREE_NEAR_PX,
  ).length;
  return { x: anchor.x + near * FREE_STEP_PX, y: anchor.y + near * FREE_STEP_PX };
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
  'composite',
]);
function asGenericType(type: string | undefined): GenericWidgetType | null {
  return type && GENERIC_TYPES.has(type as GenericWidgetType) ? (type as GenericWidgetType) : null;
}

const SHAPE_KINDS = new Set<ShapeKind>(['rect', 'ellipse', 'line', 'arrow']);

// ── Helpers de escritura inmutable sobre el preset activo ──────────────────────
function freeOf(layout: LayoutPref): FreeLayout {
  return layout.freeLayouts?.[ACTIVE_PRESET] ?? [];
}
function withFree(layout: LayoutPref, next: FreeLayout): LayoutPref {
  return { ...layout, freeLayouts: { ...layout.freeLayouts, [ACTIVE_PRESET]: next } };
}
function withGrid(layout: LayoutPref, next: StoredLayouts): LayoutPref {
  return { ...layout, layouts: { ...layout.layouts, [ACTIVE_PRESET]: next } };
}

// Deriva el id de lienzo de un widget genérico a partir del `element_id` que envía el agente.
// DETERMINISTA a propósito: el undo (App.handleUndoCanvasOps, #189 E2E 4) elimina el widget por
// el MISMO id con el que se colocó, así que ambos lados deben derivarlo igual. El prefijo `gen:`
// es obligatorio para que `renderItem` (DashboardPage) lo enrute al registry de genéricos.
export function genericElementId(elementId: string): string {
  return elementId.startsWith('gen:') ? elementId : `gen:${elementId}`;
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
  // SIEMPRE al lienzo libre: el preset «personalizado» deriva su lista de widgets de
  // `freeLayouts` en AMBOS modos (grid incluido; ver `customWidgetIds` en DashboardPage), igual
  // que el alta manual (`onAddCustomGridWidget`). Escribir solo en el grid layout dejaba el
  // widget fuera de la lista renderizada y no aparecía.
  const free = freeOf(layout);
  const next = addGenericToFree(free, id, freeSlot(free, freeAnchor(position)), spec.defaultSize);
  return { ...withFree(layout, next), genericWidgets };
}

// ── Validación del árbol composite (DSL enriquecido, #189) ──────────────────────
// El árbol `generic_spec.root` viaja DENTRO de un valor JSON desde el agente y NO pasa por la
// normalización snake→camel del backend (`camel_case_keys` solo toca claves de nivel superior).
// Por eso la validación dura (input no confiable) vive aquí: tipos, allowlist de endpoints,
// profundidad y nº de hojas.

// Allowlist de endpoints (solo lectura/GET) que puede apuntar una hoja. Espejo de
// `WIDGETABLE_ENDPOINTS` del backend (crates/domain/src/chat/context.rs). Cualquier hoja con un
// endpoint fuera de esta lista se poda.
const WIDGETABLE_ENDPOINTS = new Set<string>([
  '/dashboard/sales-by-family',
  '/dashboard/sales-by-hour',
  '/dashboard/sales-by-employee',
  '/dashboard/discount-by-employee',
  '/dashboard/product-rankings',
  '/dashboard/sales-kpis',
  '/dashboard/margin-kpis',
  '/dashboard/stockout-kpis',
  '/stock/alerts',
  '/stock/expiring',
  '/products',
  '/product-families',
  '/suppliers',
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function asSize(v: unknown): { w: number; h: number } | null {
  const r = asRecord(v);
  if (!r) return null;
  const w = Number(r.w);
  const h = Number(r.h);
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}
// `fields` puede llegar como array de columnas o como mapa campo→etiqueta (Object.values).
function normalizeFields(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String);
  const rec = asRecord(v);
  return rec ? Object.values(rec).map(String) : undefined;
}

// Normaliza y valida la `spec` de una hoja: snake_case→camelCase + tipo válido (no composite)
// + endpoint en la allowlist. Devuelve null para PODAR la hoja.
function normalizeLeafSpec(rawSpec: unknown): Omit<GenericSpec, 'root'> | null {
  const raw = asRecord(rawSpec);
  if (!raw) return null;
  const type = asGenericType(typeof raw.type === 'string' ? raw.type : undefined);
  if (!type || type === 'composite') return null; // una hoja no anida otro panel
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : '';
  if (!WIDGETABLE_ENDPOINTS.has(endpoint)) return null;

  const defaultSize = asSize(raw.defaultSize ?? raw.default_size) ?? GENERIC_DEFAULT_SIZE[type];
  const fields = normalizeFields(raw.fields);
  const params = asRecord(raw.params) as GenericSpec['params'] | null;
  const period = raw.period;
  const storeId = raw.storeId ?? raw.store_id;

  return {
    type,
    endpoint,
    // Sin título por defecto en las hojas (no 'Widget'): el rótulo lo aporta el `title` del nodo
    // hoja (CompositeNode.leaf.title). Así no sale un "Widget" redundante junto al rótulo.
    title: typeof raw.title === 'string' ? raw.title : '',
    defaultSize,
    ...(fields ? { fields } : {}),
    ...(params ? { params } : {}),
    ...(typeof period === 'string' ? { period: period as NonNullable<GenericSpec['period']> } : {}),
    ...(typeof storeId === 'string' ? { storeId } : {}),
  };
}

// Valida un nodo del árbol recursivamente. Un nodo a `depth >= MAX_COMPOSITE_DEPTH` se rechaza
// (consistente con el corte de render en GenericComposite: la raíz es depth 0 → máx MAX niveles).
// Un `stack` sin hijos válidos se poda; una `leaf` con spec inválida se poda.
function validateCompositeNode(raw: unknown, depth: number): CompositeNode | null {
  if (depth >= MAX_COMPOSITE_DEPTH) return null;
  const node = asRecord(raw);
  if (!node) return null;

  if (node.kind === 'stack') {
    const dir = node.dir === 'col' ? 'col' : node.dir === 'row' ? 'row' : null;
    if (!dir) return null;
    const childrenRaw = Array.isArray(node.children) ? node.children : [];
    const children = childrenRaw
      .map((c) => validateCompositeNode(c, depth + 1))
      .filter((c): c is CompositeNode => c != null);
    if (children.length === 0) return null;
    return {
      kind: 'stack',
      dir,
      children,
      ...(isFiniteNumber(node.span) ? { span: node.span } : {}),
      ...(typeof node.title === 'string' ? { title: node.title } : {}),
      ...(isFiniteNumber(node.gap) ? { gap: node.gap } : {}),
    };
  }

  if (node.kind === 'leaf') {
    const spec = normalizeLeafSpec(node.spec);
    if (!spec) return null;
    return {
      kind: 'leaf',
      spec,
      ...(isFiniteNumber(node.span) ? { span: node.span } : {}),
      ...(typeof node.title === 'string' ? { title: node.title } : {}),
    };
  }

  return null;
}

function countLeaves(node: CompositeNode): number {
  return node.kind === 'leaf' ? 1 : node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

// Poda hojas si superan `max`: BFS que conserva las primeras `max` hojas (las más superficiales)
// y descarta el resto; un stack que queda sin hijos también se elimina. Devuelve null si todo el
// árbol se poda.
function pruneLeaves(root: CompositeNode, max: number): CompositeNode | null {
  if (countLeaves(root) <= max) return root;
  const keep = new Set<CompositeNode>();
  const queue: CompositeNode[] = [root];
  while (queue.length > 0 && keep.size < max) {
    const node = queue.shift()!;
    if (node.kind === 'leaf') keep.add(node);
    else queue.push(...node.children);
  }
  const rebuild = (node: CompositeNode): CompositeNode | null => {
    if (node.kind === 'leaf') return keep.has(node) ? node : null;
    const children = node.children.map(rebuild).filter((c): c is CompositeNode => c != null);
    return children.length > 0 ? { ...node, children } : null;
  };
  return rebuild(root);
}

// Normaliza el `genericSpec` que envía el agente (CanvasOp, campos laxos) al `GenericSpec`
// persistido (campos estrictos). Devuelve null si el tipo no es válido, o (composite) si el
// árbol resulta vacío/sin hojas válidas.
function normalizeGenericSpec(raw: NonNullable<CanvasOp['genericSpec']>): GenericSpec | null {
  const type = asGenericType(raw.type);
  if (!type) return null;

  if (type === 'composite') {
    const validated = validateCompositeNode(raw.root, 0);
    const root = validated ? pruneLeaves(validated, MAX_COMPOSITE_LEAVES) : null;
    if (!root) return null;
    return {
      type,
      endpoint: '',
      title: raw.title ?? 'Panel',
      defaultSize: raw.defaultSize ?? GENERIC_DEFAULT_SIZE.composite,
      root,
    };
  }

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
  /** Disposición persistida del dashboard (lienzo libre + widgets genéricos). */
  layout: LayoutPref;
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
  // ── Operaciones de lienzo (devuelven {accepted, reason}) ──
  addWidget: (widgetId: string, position?: string) => CanvasResult;
  removeElement: (elementId: string) => CanvasResult;
  removeWidget: (widgetId: string) => CanvasResult;
  clearCanvas: () => CanvasResult;
  arrange: () => CanvasResult;
  addShape: (kind: string, position?: string) => CanvasResult;
  addText: (text: string, position?: string) => CanvasResult;
  addNote: (text: string, position?: string) => CanvasResult;
  addInsight: (
    content: string,
    title?: string,
    position?: string,
    elementId?: string,
  ) => CanvasResult;
  /** Despacha una operación del agente a la acción correspondiente. */
  applyCanvasOp: (op: CanvasOp) => CanvasResult;
}

export type DashboardStore = DashboardState & DashboardActions;

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  layout: {},
  hydrated: false,

  hydrate: (layout) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    // Reconstruye el registry de genéricos desde el layout persistido: WIDGET_REGISTRY es estado
    // de módulo (no se persiste), así que tras recargar hay que re-registrar cada `gen:<uuid>` o
    // `renderItem('gen:…')` (#189 slice 0.1) no encontraría su spec y la tarjeta saldría vacía.
    for (const [id, spec] of Object.entries(layout.genericWidgets ?? {})) {
      registerGenericWidget(id, spec);
    }
    // `hydrated: true` habilita la persistencia (ver `persistEnabled`): a partir de aquí cualquier
    // escritura parte del layout real del servidor, no del `{}` inicial.
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
    // No vuelques el layout si aún no se ha hidratado: sería el `{}` inicial y pisaría el bueno.
    if (!persistEnabled()) return;
    persistFn?.(get().layout);
  },
  setLayout: (next) => {
    set({ layout: next });
    schedulePersist(next);
  },

  addWidget: (widgetId, position) => {
    const { layout } = get();
    if (!(widgetId in ITEM_SPECS)) {
      return rejected(`widgetId desconocido: ${widgetId}`);
    }
    // SIEMPRE al lienzo libre (ver nota en `placeGeneric`): es la fuente de la lista de widgets
    // del preset personalizado tanto en grid como en libre. Antes, en grid escribía en el grid
    // layout y el widget no llegaba a renderizarse.
    const free = freeOf(layout);
    const next = addWidgetToFree(free, widgetId, freeSlot(free, freeAnchor(position)));
    if (next === free) return rejected(`el widget ya está en el lienzo: ${widgetId}`);
    get().setLayout(withFree(layout, next));
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
    get().setLayout(withFree(layout, autoArrangeFree(freeOf(layout))));
    return ACCEPTED;
  },

  addShape: (kind, position) => {
    const { layout } = get();
    if (!SHAPE_KINDS.has(kind as ShapeKind)) return rejected(`forma desconocida: ${kind}`);
    const shape = kind as ShapeKind;
    const free = freeOf(layout);
    const at = freeSlot(free, freeAnchor(position));
    const box = { x: at.x, y: at.y, w: 220, h: 140 };
    const opts =
      shape === 'line' || shape === 'arrow'
        ? { stroke: DRAW_COLORS[0]!, strokeWidth: DRAW_STROKE_WIDTH, diag: 'main' as const }
        : { stroke: DRAW_COLORS[0]!, strokeWidth: DRAW_STROKE_WIDTH };
    const next = addShapeEl(free, crypto.randomUUID(), shape, box, opts);
    get().setLayout(withFree(layout, next));
    return ACCEPTED;
  },

  addText: (text, position) => {
    const { layout } = get();
    const free = freeOf(layout);
    const next = addTextEl(
      free,
      crypto.randomUUID(),
      freeSlot(free, freeAnchor(position)),
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
    const free = freeOf(layout);
    const next = addNoteEl(free, crypto.randomUUID(), freeSlot(free, freeAnchor(position)));
    // NOTA(F4.2): el `text` del agente se vuelca a un doc TipTap; aquí se crea la nota vacía.
    void text;
    get().setLayout(withFree(layout, next));
    return ACCEPTED;
  },

  addInsight: (content, title, position, elementId) => {
    const { layout } = get();
    // Id determinista desde el element_id del agente para que el undo lo encuentre (#189).
    const id = elementId ? genericElementId(elementId) : `gen:${crypto.randomUUID()}`;
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
          if (!spec) {
            return rejected(
              op.genericSpec.type === 'composite'
                ? 'panel compuesto inválido: árbol vacío, demasiado profundo o sin hojas con endpoint permitido'
                : `tipo de widget genérico no válido: ${op.genericSpec.type}`,
            );
          }
          // Id determinista desde el element_id del agente para que el undo lo encuentre (#189).
          const id = op.elementId ? genericElementId(op.elementId) : `gen:${crypto.randomUUID()}`;
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
        return get().addInsight(op.content ?? op.text ?? '', undefined, op.position, op.elementId);
      case 'remove_element':
        if (!op.elementId) return rejected('remove_element sin elementId');
        return get().removeElement(op.elementId);
      case 'arrange':
        return get().arrange();
      case 'clear_canvas':
        return get().clearCanvas();
      default:
        return rejected(`operación desconocida: ${(op as CanvasOp).op}`);
    }
  },
}));

// ── Snapshot del lienzo para el system prompt del agente (F5, #188) ─────────────
// Forma que espera `build_system_prompt` en el backend: elementos con id interno y label
// humano (con coords del lienzo libre), truncado a 30. Viaja en el body del POST /chat para que
// el prompt refleje el estado FRESCO del lienzo (no el snapshot persistido, que puede ser stale).
const SNAPSHOT_MAX = 30;

export interface CanvasSnapshotElement {
  id: string;
  label: string;
  x?: number;
  y?: number;
}
export interface CanvasSnapshot {
  elements: CanvasSnapshotElement[];
  totalElements: number;
}

// Label humano de un elemento del lienzo libre (widget→etiqueta del registry; resto→tipo).
function freeElementLabel(el: FreeElement): string {
  switch (el.kind) {
    case 'widget':
      return getWidgetLabel(el.widgetId);
    case 'note':
      return 'Nota';
    case 'text':
      return el.text ? `Texto: «${el.text.slice(0, 40)}»` : 'Texto';
    case 'shape':
      return `Forma (${el.shape})`;
    case 'draw':
      return 'Dibujo';
  }
}

// Construye el snapshot del lienzo desde el estado actual del store.
export function buildCanvasSnapshot(): CanvasSnapshot {
  const { layout } = useDashboardStore.getState();
  // Los elementos del preset «personalizado» viven en `freeLayouts`. El snapshot que ve el agente
  // se construye desde el lienzo libre (única vista del dashboard).
  const all: CanvasSnapshotElement[] = (layout.freeLayouts?.[ACTIVE_PRESET] ?? []).map((e) => ({
    id: e.id,
    label: freeElementLabel(e),
    x: Math.round(e.x),
    y: Math.round(e.y),
  }));
  return { elements: all.slice(0, SNAPSHOT_MAX), totalElements: all.length };
}
