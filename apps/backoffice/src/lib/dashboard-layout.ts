// Composición y layout del dashboard. La COMPOSICIÓN (qué tarjetas KPI y qué paneles
// aparecen) la dictan los presets (D-08/D-18) — no hay mostrar/ocultar manual. Lo que
// SÍ personaliza el usuario (D-19) es la COLOCACIÓN 2D de cada elemento dentro del
// preset, vía "Personalizar" (tablero arrastrable con snap a la rejilla), persistida por
// preset en la preferencia `dashboard.layout`.

import type { DashboardPeriod } from './dashboard.js';

export type PresetId = 'personalizado' | 'ventas' | 'beneficio' | 'inventario' | 'equipo';

// Cards con toggle barras↔línea independiente. El tipo de gráfico es LOCAL a cada card.
export type ChartCard = 'sales' | 'hour';

export interface PresetDef {
  id: PresetId;
  label: string;
  cards: string[];
  panels: string[];
}

// Único preset activo: «personalizado». El usuario compone el dashboard con el agente
// o manualmente. Los presets anteriores (ventas/beneficio/inventario/equipo) se migraron
// en F0 y sus datos se mantienen en LayoutPref.layouts/freeLayouts por legacy.
export const PRESETS: PresetDef[] = [
  {
    id: 'personalizado',
    label: 'Personalizado',
    cards: [],
    panels: [],
  },
];

// Orden CANÓNICO de los paneles (= orden de maquetación histórico). Define el orden por
// defecto de colocación: se filtra por los paneles que el preset incluye. El bloque de
// rankings se representa con tres ids (uno por pestaña inicial); solo uno por preset.
export const PANEL_CANON: string[] = ['dash-bars', 'dash-hour'];

// Orden por defecto de los paneles de un preset: los del preset, en orden canónico.
export function defaultPanelOrder(preset: PresetDef): string[] {
  const inPreset = new Set(preset.panels);
  return PANEL_CANON.filter((id) => inPreset.has(id));
}

// Tamaño por defecto (en unidades de rejilla de 12 columnas) de cada elemento. Las
// tarjetas KPI ocupan 2 columnas y 1 fila; los paneles heredan su ancho histórico
// (span 5/7/12) y un alto que encaja su contenido (gráfico ~200px o lista con scroll).
export const BOARD_COLS = 12;
export const ITEM_SPECS: Record<string, { w: number; h: number }> = {
  // Únicos widgets del catálogo: «Ventas» y «Ventas por hora».
  'dash-bars': { w: 7, h: 2 },
  // "Ventas por hora": gráfico + barra fina de navegación. El gráfico llena el alto del tile
  // (dash-panel--fill), así que 2 filas bastan sin dejar hueco inferior.
  'dash-hour': { w: 7, h: 2 },
  // Sección 01 · KPIs (rediseño): rejilla conectada (tarjeta redondeada de 6 KPIs, banda baja) y clásica.
  'kpi-grid-connected': { w: 12, h: 1 },
  'kpi-classic': { w: 3, h: 1 },
  // Sección 02 · Gráficas (rediseño): distribución horaria (área), ventas por tienda (barras) y heatmap.
  // La distribución horaria comparte tamaño con el heatmap (6×2): contenido compacto, sin scroll.
  'graf-hour-area': { w: 6, h: 2 },
  'graf-store-bars': { w: 6, h: 2 },
  'graf-heatmap': { w: 6, h: 2 },
  // Sección 03 · Listas (rediseño): reparto por familia, ranking de productos y mix (treemap).
  'lista-familia': { w: 4, h: 3 },
  'lista-rankings': { w: 4, h: 3 },
  'lista-mix': { w: 4, h: 3 },
  // Sección 05 · Compactos (rediseño): tiles pequeños (ribbon, donut, treemap, top, cifra-héroe).
  'cmp-ribbon': { w: 3, h: 2 },
  'cmp-donut': { w: 3, h: 2 },
  'cmp-treemap': { w: 3, h: 2 },
  'cmp-leaderboard': { w: 3, h: 3 },
  'cmp-hero': { w: 5, h: 2 },
  // Sección 06 · Diagnóstico (rediseño): feed de actividad (lista alta).
  'diag-actividad': { w: 4, h: 3 },
  // Sección 07 · KPIs · más formatos (rediseño): tarjetas KPI (dual, área, alerta, 7 días).
  'kpi-dual': { w: 3, h: 2 },
  'kpi-area': { w: 3, h: 2 },
  'kpi-alerta': { w: 3, h: 2 },
  'kpi-7dias': { w: 3, h: 2 },
  // Sección 08 · Mini gráficas (rediseño): tiles de bolsillo (rejilla de 5 en el handoff).
  'mini-tiendas': { w: 3, h: 1 },
  'mini-tendencia': { w: 3, h: 1 },
  'mini-acumulado': { w: 3, h: 1 },
  'mini-donut': { w: 3, h: 1 },
  'mini-gauge': { w: 3, h: 1 },
  'mini-familias': { w: 3, h: 1 },
  'mini-heatmap': { w: 3, h: 1 },
  'mini-columnas': { w: 3, h: 1 },
  // Sección 09 · Listas y tablas (rediseño): tarjetas de filas (hasta 6 filas → tile medio).
  'tabla-simple': { w: 4, h: 2 },
  'tabla-avatar': { w: 4, h: 2 },
  'tabla-estado': { w: 4, h: 2 },
  'tabla-variacion': { w: 4, h: 2 },
  'tabla-ranking': { w: 4, h: 2 },
  'tabla-tareas': { w: 4, h: 2 },
  // Sección 10 · Estado y progreso (rediseño): stepper ancho, estado compacto y checklist.
  'estado-pasos': { w: 4, h: 1 },
  'estado-operativo': { w: 2, h: 1 },
  'estado-cumplimiento': { w: 3, h: 1 },
};

const DEFAULT_SPEC = { w: 4, h: 2 };

// Ids (cards + paneles) de un preset, en orden canónico de colocación.
export function presetItemIds(preset: PresetDef): string[] {
  return [...preset.cards, ...defaultPanelOrder(preset)];
}

// Coordenadas de un elemento en la rejilla (subconjunto de LayoutItem de react-grid-layout,
// sin acoplar este módulo a la librería). x/y/w/h en unidades de rejilla.
export interface LayoutCoords {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Layout por breakpoint: { lg: [...], sm: [...] }. Lo que se persiste por preset (legacy:
// solo lo lee la migración; el dashboard ya no renderiza la rejilla, solo el lienzo libre).
export type StoredLayouts = Record<string, LayoutCoords[]>;

// ── Lienzo libre (D-20): elementos del lienzo ──
// Base común a PÍXEL (coords de mundo). `z` = orden de apilado (mayor = delante), necesario
// porque notas y widgets pueden solaparse. Cada elemento es una unión discriminada por `kind`.
export interface FreeBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}
// Widget del catálogo (clave de ITEM_SPECS): su contenido lo renderiza la DashboardPage.
export interface FreeWidget extends FreeBase {
  kind: 'widget';
  widgetId: string;
}
// Nota de texto enriquecido: `doc` es el documento JSON de TipTap (ProseMirror); null = vacía.
interface FreeNote extends FreeBase {
  kind: 'note';
  doc: unknown;
  color?: string;
}
// Forma vectorial dibujada por el usuario. La caja (x,y,w,h) es su bounding box. Para
// línea/flecha, `diag` indica qué diagonal de la caja une los extremos.
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';
export interface FreeShape extends FreeBase {
  kind: 'shape';
  shape: ShapeKind;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  /** Solo línea/flecha: 'main' = ↘ (esq. sup-izq → inf-der), 'anti' = ↗. */
  diag?: 'main' | 'anti';
}
// Trazo a mano alzada (lápiz / escritura a mano). `points` son px de mundo RELATIVOS a (x,y);
// la caja (x,y,w,h) es su bounding box (para arrastrar/quitar como un elemento más).
export interface FreeDraw extends FreeBase {
  kind: 'draw';
  points: Array<[number, number]>;
  stroke: string;
  strokeWidth: number;
}
// Texto libre: cadena plana colocable en cualquier sitio (sin caja/fondo de nota).
export interface FreeText extends FreeBase {
  kind: 'text';
  text: string;
  color: string;
  fontSize: number;
}
export type FreeElement = FreeWidget | FreeNote | FreeShape | FreeDraw | FreeText;
export type FreeLayout = FreeElement[];

// Paleta y trazos por defecto de las herramientas de dibujo.
export const DRAW_COLORS = ['#1f2933', '#2563eb', '#16a34a', '#dc2626', '#d97706'];
export const DRAW_STROKE_WIDTH = 3;
export const TEXT_DEFAULT = { w: 220, h: 40, fontSize: 18 };

// ── Widgets genéricos (D-22, chatbot #188) ──
// El agente puede crear widgets parametrizables (no del catálogo fijo) apuntando a un
// endpoint de lectura. Su configuración vive en `LayoutPref.genericWidgets[id]` (id =
// `gen:<uuid>`) para reconstruirlos al recargar. El `type` decide el componente que los
// renderiza (ver `apps/backoffice/src/widgets/generic/`).
export type GenericWidgetType =
  | 'table'
  | 'bar'
  | 'line'
  | 'area'
  | 'stacked'
  | 'pie'
  | 'donut'
  | 'kpi'
  | 'insight'
  | 'composite';

// ── DSL de layout enriquecido (#189) ──
// Límites de seguridad del árbol composite: el agente emite datos no confiables y la
// validación dura vive en `normalizeGenericSpec` (ver dashboard-store.ts). Profundidad
// contada desde la raíz (depth 0); un nodo es válido/visible solo si `depth < MAX`.
export const MAX_COMPOSITE_DEPTH = 3;
export const MAX_COMPOSITE_LEAVES = 12;

// Nodo recursivo del DSL. Un `stack` agrupa hijos en fila/columna (con span/gap/título de
// sección opcionales); una `leaf` es una mini-visualización (un GenericSpec sin `root`, para
// que no anide composites dentro de hojas). Representa el árbol YA validado/normalizado.
export type CompositeNode =
  | {
      kind: 'stack';
      dir: 'row' | 'col';
      span?: number;
      title?: string;
      gap?: number;
      children: CompositeNode[];
    }
  | { kind: 'leaf'; span?: number; title?: string; spec: Omit<GenericSpec, 'root'> };

// Configuración persistida de un widget genérico. `endpoint` es relativo a `/api` y debe
// estar en la allowlist (validada en frontend, ver Fase 5). `params` son query params;
// `fields` nombra las columnas/series relevantes. `defaultSize` (unidades de grid) lo usa
// `addWidgetToGrid`/`addWidget` cuando el id no está en `ITEM_SPECS`.
export interface GenericSpec {
  type: GenericWidgetType;
  endpoint: string;
  params?: Record<string, string | number | boolean>;
  fields?: string[];
  period?: DashboardPeriod;
  storeId?: string | null;
  title: string;
  defaultSize: { w: number; h: number };
  /** Solo cuando `type === 'composite'`: árbol de layout (#189). `endpoint` es '' en ese caso. */
  root?: CompositeNode;
  // ── DSL v2 (#204): panel por receta + slots tipados ──
  // Cuando `kind === 'panel'`, el render despacha a GenericPanel (no a GenericComposite). El
  // `type` se conserva en 'composite' por compat (mismo bucket de tamaño/hidratación); `kind`
  // tiene prioridad en el render. El árbol libre (`root`) NO se usa en v2 — lo reemplazan recipe+slots.
  kind?: 'panel';
  version?: number;
  recipe?: RecipeId;
  density?: PanelDensity;
  slots?: Partial<Record<SlotName, PieceSpec[]>>;
}

// ── DSL v2 (#204): vocabulario de piezas + recetas ──
// El agente ENSAMBLA piezas con diseño horneado dentro de recetas con slots tipados. La
// granularidad alta vive en el VOCABULARIO (piezas); la baja, en los GRADOS DE LIBERTAD
// (recetas cerradas, slots tipados). La allowlist/recetas/slots viven en `dashboard-pieces.ts`.

// Molécula referenciada por una hoja-pieza (cada una con diseño horneado: orden, cap, formato,
// degradación). `insight` NO es pieza de slot (es el fallback v1 type:'insight').
export type PieceId =
  | 'kpiTile'
  | 'comparisonBars'
  | 'trendLine'
  | 'trendArea'
  | 'shareDonut'
  | 'rankBarList'
  | 'segmentBar'
  | 'progressMeter'
  | 'stockAlertList'
  | 'dataGrid';

// Receta cerrada: dicta el grid-template (ancho/alto/gutter), no el agente.
export type RecipeId =
  | 'kpiRow'
  | 'kpiRow+oneChart'
  | 'kpiRow+twoCharts'
  | 'heroChart+sideStats'
  | 'tableFull';

// Slot tipado dentro de una receta. `kpis` solo admite kpiTile; `charts` admite el set de gráficas.
export type SlotName = 'kpis' | 'charts';

export type PanelDensity = 'compact' | 'comfortable';

// Formato es-ES de una cifra (enum; el agente nunca toca el formateo, lo hornea la pieza).
// `percentRatio` = fracción 0..1 que se multiplica ×100 (las tasas del dashboard llegan así, #208).
export type PieceFormat = 'eur' | 'percent' | 'percentRatio' | 'decimal' | 'units' | 'integer';

// Columna de un dataGrid: campo + etiqueta legible + formato/alineación opcionales.
export interface DataGridColumnSpec {
  field: string;
  label: string;
  format?: PieceFormat;
  align?: 'left' | 'right' | 'center';
}

// Hoja-pieza: referencia una molécula (`piece`) + bindings de datos (endpoint/params/campos) +
// enums clampados. Sin geometría libre (la receta dicta el layout).
export interface PieceSpec {
  piece: PieceId;
  title?: string;
  endpoint?: string;
  labelField?: string;
  valueField?: string;
  deltaField?: string;
  sparkField?: string;
  targetField?: string;
  target?: number;
  format?: PieceFormat;
  maxRows?: number;
  maxBars?: number;
  columns?: DataGridColumnSpec[];
  params?: Record<string, string | number | boolean>;
  period?: DashboardPeriod;
  storeId?: string | null;
}

// Tamaño por defecto (unidades de grid) por tipo de widget genérico. El agente puede
// sobreescribirlo en `GenericSpec.defaultSize`.
export const GENERIC_DEFAULT_SIZE: Record<GenericWidgetType, { w: number; h: number }> = {
  table: { w: 6, h: 3 },
  bar: { w: 6, h: 2 },
  line: { w: 6, h: 2 },
  area: { w: 6, h: 2 },
  stacked: { w: 6, h: 2 },
  pie: { w: 4, h: 3 },
  donut: { w: 4, h: 3 },
  kpi: { w: 2, h: 1 },
  insight: { w: 5, h: 2 },
  composite: { w: 8, h: 5 },
};

// Preferencia de layout: preset activo, modo, tipo de gráfico por card, colocación 2D del
// tablero (grid, por breakpoint) y colocación libre (free, a píxel) — ambas por preset.
// Las claves antiguas (cardOrder/panelOrder, hiddenByPreset, chartKind global) se ignoran.
export interface LayoutPref {
  preset?: PresetId;
  /** Modo de disposición del dashboard: 'grid' (rejilla responsive, scroll vertical) o 'free'
   *  (lienzo libre, colocación a píxel). Por defecto 'free'. Comparten los mismos widgets. */
  mode?: 'grid' | 'free';
  /** U-02: representación (barras o línea) de cada card con toggle, independiente. */
  chartKinds?: Partial<Record<ChartCard, 'bars' | 'line'>>;
  /** D-19: colocación 2D por preset (layouts por breakpoint de react-grid-layout). */
  layouts?: Partial<Record<PresetId, StoredLayouts>>;
  /** D-20: colocación libre a píxel por preset (lienzo edgeless). */
  freeLayouts?: Partial<Record<PresetId, FreeLayout>>;
  /** D-20: pan/zoom guardado del lienzo libre por preset (evita zoom inconsistente al cambiar). */
  freeViews?: Partial<Record<PresetId, { panX: number; panY: number; zoom: number }>>;
  /** D-21: cards/paneles quitados del tablero (Cuadrícula) por preset, vía «Personalizar». */
  hiddenByPreset?: Partial<Record<PresetId, string[]>>;
  /** D-22 (#188): widgets genéricos creados por el agente, indexados por `gen:<uuid>`. */
  genericWidgets?: Record<string, GenericSpec>;
}

// Migración única F0 (#188): un usuario con un preset antiguo (ventas/beneficio/
// inventario/equipo) ve su composición copiada a `personalizado` y el preset fijado.
// Es idempotente y NO destructiva: las claves antiguas se conservan por seguridad.
// Devuelve el MISMO objeto si no hay nada que migrar, para que el llamador pueda
// evitar persistir sin cambios (comparación por identidad).
export function migrateLayoutPref(layout: LayoutPref): LayoutPref {
  const oldPreset = layout.preset;
  if (!oldPreset || oldPreset === 'personalizado') return layout;
  const pid = oldPreset;
  const migratedLayouts = layout.layouts?.[pid] ?? layout.layouts?.personalizado;
  const migratedFreeLayouts = layout.freeLayouts?.[pid] ?? layout.freeLayouts?.personalizado;
  const migratedFreeViews = layout.freeViews?.[pid] ?? layout.freeViews?.personalizado;
  return {
    ...layout,
    preset: 'personalizado',
    layouts: {
      ...layout.layouts,
      ...(migratedLayouts !== undefined ? { personalizado: migratedLayouts } : {}),
    },
    freeLayouts: {
      ...layout.freeLayouts,
      ...(migratedFreeLayouts !== undefined ? { personalizado: migratedFreeLayouts } : {}),
    },
    freeViews: {
      ...layout.freeViews,
      ...(migratedFreeViews !== undefined ? { personalizado: migratedFreeViews } : {}),
    },
  };
}

// Layout por defecto (breakpoint lg, 12 columnas): coloca primero las tarjetas KPI en una
// banda superior (2 columnas cada una) y luego los paneles fluyendo en filas de 12, en
// orden canónico. Reproduce la maquetación histórica como punto de partida del tablero.
export function buildDefaultLayout(preset: PresetDef): LayoutCoords[] {
  const items: LayoutCoords[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  const place = (id: string): void => {
    const spec = ITEM_SPECS[id] ?? DEFAULT_SPEC;
    if (x + spec.w > BOARD_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    items.push({ i: id, x, y, w: spec.w, h: spec.h });
    x += spec.w;
    rowH = Math.max(rowH, spec.h);
  };
  for (const id of preset.cards) place(id);
  // Salto de fila entre la banda de tarjetas y los paneles.
  if (x > 0) {
    x = 0;
    y += rowH;
    rowH = 0;
  }
  for (const id of defaultPanelOrder(preset)) place(id);
  return items;
}

// Reconcilia un layout guardado con los elementos válidos actuales del preset: descarta
// coordenadas de ids que ya no existen y AÑADE (al pie) los nuevos con su tamaño por
// defecto. Devuelve siempre un array nuevo (inmutable).
export function reconcileLayout(saved: LayoutCoords[], itemIds: string[]): LayoutCoords[] {
  const valid = new Set(itemIds);
  const kept = saved.filter((it) => valid.has(it.i));
  const present = new Set(kept.map((it) => it.i));
  const missing = itemIds.filter((id) => !present.has(id));
  if (missing.length === 0) return kept;
  // Coloca los que falten debajo de todo, en orden canónico, fluyendo en filas de 12.
  const maxY = kept.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  let x = 0;
  let y = maxY;
  let rowH = 0;
  const extra: LayoutCoords[] = [];
  for (const id of missing) {
    const spec = ITEM_SPECS[id] ?? DEFAULT_SPEC;
    if (x + spec.w > BOARD_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    extra.push({ i: id, x, y, w: spec.w, h: spec.h });
    x += spec.w;
    rowH = Math.max(rowH, spec.h);
  }
  return [...kept, ...extra];
}

// ── Inserción en la rejilla (D-22, chatbot #188) ──
// Columnas por breakpoint del tablero RGL (espejo de `BOARD_COLS_BY_BP` en DashboardPage).
export const GRID_BREAKPOINT_COLS: Record<string, number> = {
  lg: 12,
  md: 12,
  sm: 6,
  xs: 4,
  xxs: 2,
};

// Posición semántica donde el agente quiere colocar un widget en la rejilla.
export type SemanticPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center';

// x (en columnas) según el ancla horizontal de la posición y el ancho ya clampeado.
function anchorX(position: SemanticPosition, cols: number, w: number): number {
  if (position.endsWith('right')) return Math.max(0, cols - w);
  if (position.endsWith('center') || position === 'center')
    return Math.max(0, Math.floor((cols - w) / 2));
  return 0; // left
}

// ¿Colisiona el rectángulo `r` con alguno de `items`? (solape en x e y a la vez).
function collidesGrid(items: readonly LayoutCoords[], r: LayoutCoords): boolean {
  return items.some(
    (it) => r.x < it.x + it.w && r.x + r.w > it.x && r.y < it.y + it.h && r.y + r.h > it.y,
  );
}

// Columnas candidatas (en orden de preferencia) para el ancla horizontal de la posición.
function candidateXs(position: SemanticPosition, cols: number, w: number): number[] {
  const max = Math.max(0, cols - w);
  if (max === 0) return [0];
  if (position.endsWith('right')) {
    return Array.from({ length: max + 1 }, (_, i) => max - i); // derecha → izquierda
  }
  if (position.endsWith('center') || position === 'center') {
    const center = Math.floor(max / 2);
    // Desde el centro hacia afuera (centro, centro-1, centro+1, …).
    const order = [center];
    for (let d = 1; d <= max; d++) {
      if (center - d >= 0) order.push(center - d);
      if (center + d <= max) order.push(center + d);
    }
    return order;
  }
  return Array.from({ length: max + 1 }, (_, i) => i); // izquierda → derecha
}

// Primer hueco libre para un widget de tamaño w×h respetando la posición semántica. El
// acumulador de ocupación es `items` (la ocupación ACTUAL del breakpoint). top/center
// escanean filas desde arriba; bottom desde debajo de todo lo existente. Garantiza no solapar
// (una fila vacía suficientemente abajo siempre ofrece hueco → termina). #188 F4.2.
function firstFreeSlot(
  items: readonly LayoutCoords[],
  cols: number,
  w: number,
  h: number,
  position: SemanticPosition,
): { x: number; y: number } {
  const baseY = position.startsWith('bottom')
    ? items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    : 0;
  const xs = candidateXs(position, cols, w);
  for (let y = baseY; y < baseY + 1000; y++) {
    for (const x of xs) {
      if (!collidesGrid(items, { i: '', x, y, w, h })) return { x, y };
    }
  }
  // Inalcanzable en la práctica; fallback defensivo bajo todo lo existente.
  return { x: anchorX(position, cols, w), y: baseY };
}

// Inserta un widget (catálogo o `gen:<uuid>`) en la rejilla, devolviendo unos `StoredLayouts`
// nuevos (inmutable). El llamador resuelve `size` antes (ITEM_SPECS para catálogo,
// GenericSpec.defaultSize para genéricos). Inserta en `lg` SIEMPRE y en cada breakpoint ya
// presente en `layouts`, clampando el ancho a las columnas de cada uno. NO fabrica breakpoints
// estrechos a partir de `lg` (reproducir el reflow 12→N columnas es trabajo de RGL, que deriva
// los breakpoints ausentes de `lg` al renderizar). Si el widget ya estaba, se reemplaza.
export function addWidgetToGrid(
  layouts: StoredLayouts,
  widgetId: string,
  size: { w: number; h: number },
  position: SemanticPosition = 'top-left',
): StoredLayouts {
  const result: StoredLayouts = { ...layouts };
  const targets = new Set<string>(['lg', ...Object.keys(layouts)]);
  for (const bp of targets) {
    const cols = GRID_BREAKPOINT_COLS[bp] ?? BOARD_COLS;
    const w = Math.min(size.w, cols);
    const existing = (layouts[bp] ?? []).filter((it) => it.i !== widgetId);
    const slot = firstFreeSlot(existing, cols, w, size.h, position);
    const item: LayoutCoords = { i: widgetId, x: slot.x, y: slot.y, w, h: size.h };
    result[bp] = [...existing, item];
  }
  return result;
}

// ── Lienzo libre (D-20) ──
// Traducción de unidades de rejilla a píxeles de mundo para sembrar el lienzo. Cada celda
// mide FREE_COL×FREE_ROW e incluye un hueco (FREE_GAP) descontado del tamaño del item, de
// modo que la disposición inicial replica la del grid pero a píxel.
export const FREE_COL = 100;
export const FREE_ROW = 160;
export const FREE_GAP = 16;

// Tamaño a píxel de un elemento en el lienzo libre (derivado de su tamaño de rejilla).
export function freeItemSize(id: string): { w: number; h: number } {
  const spec = ITEM_SPECS[id] ?? DEFAULT_SPEC;
  return { w: spec.w * FREE_COL - FREE_GAP, h: spec.h * FREE_ROW - FREE_GAP };
}

// INVERSA EXACTA de `freeItemSize`: recupera las unidades enteras de rejilla (columnas/filas) a
// partir del tamaño en píxeles de un elemento del lienzo. Como el px de mundo es `u·CELDA − GAP`,
// `round((px + GAP) / CELDA)` devuelve la unidad original sin pérdida para todo lo sembrado desde
// la rejilla (catálogo y genéricos); para elementos de tamaño libre (notas redimensionadas) cae al
// número entero de celdas más cercano. Las columnas se clampan a [1, BOARD_COLS]; las filas a ≥1.
// Es lo que usa el modo CUADRÍCULA para teselar sin huecos sobre una rejilla real de 12 columnas,
// en vez de aproximar el tramo con umbrales de píxel (que dejaban huecos y no llenaban el ancho).
export function freeUnitsFromPx(w: number, h: number): { cols: number; rows: number } {
  const cols = Math.min(BOARD_COLS, Math.max(1, Math.round((w + FREE_GAP) / FREE_COL)));
  const rows = Math.max(1, Math.round((h + FREE_GAP) / FREE_ROW));
  return { cols, rows };
}

// Tamaño por defecto de una nota nueva (px de mundo).
export const NOTE_DEFAULT = { w: 240, h: 180 };

// Disposición libre por defecto: parte de la maquetación del grid y la pasa a píxeles, así
// las cards aparecen donde estaban en cuadrícula y de ahí el usuario las mueve libremente.
// Cada elemento es un widget; `z` sigue el orden canónico de colocación.
export function buildDefaultFreeLayout(preset: PresetDef): FreeLayout {
  return buildDefaultLayout(preset).map((it, idx) => ({
    kind: 'widget',
    id: it.i,
    widgetId: it.i,
    x: it.x * FREE_COL,
    y: it.y * FREE_ROW,
    w: it.w * FREE_COL - FREE_GAP,
    h: it.h * FREE_ROW - FREE_GAP,
    z: idx,
  }));
}

const toFiniteNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// Migra UNA entrada persistida (JSON arbitrario) al modelo actual. Acepta:
//  - formato antiguo (FreeCoords plano `{i,x,y,w,h}`) → FreeWidget;
//  - formato nuevo (`{kind:'widget',widgetId}` o `{kind:'note',doc}`).
// Devuelve null si la entrada es irrecuperable (se descarta).
function migrateFreeElement(raw: unknown, index: number): FreeElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const x = toFiniteNumber(o.x, 0);
  const y = toFiniteNumber(o.y, 0);
  const z = toFiniteNumber(o.z, index);
  const base = {
    id: typeof o.id === 'string' ? o.id : `${String(o.kind ?? 'el')}-${index}`,
    x,
    y,
    z,
  };
  if (o.kind === 'note') {
    return {
      kind: 'note',
      ...base,
      w: toFiniteNumber(o.w, NOTE_DEFAULT.w),
      h: toFiniteNumber(o.h, NOTE_DEFAULT.h),
      doc: 'doc' in o ? o.doc : null,
      ...(typeof o.color === 'string' ? { color: o.color } : {}),
    };
  }
  if (o.kind === 'shape') {
    const shape = (o.shape as ShapeKind) ?? 'rect';
    return {
      kind: 'shape',
      ...base,
      shape,
      w: toFiniteNumber(o.w, 80),
      h: toFiniteNumber(o.h, 80),
      stroke: typeof o.stroke === 'string' ? o.stroke : DRAW_COLORS[0]!,
      strokeWidth: toFiniteNumber(o.strokeWidth, DRAW_STROKE_WIDTH),
      ...(typeof o.fill === 'string' ? { fill: o.fill } : {}),
      ...(o.diag === 'anti' || o.diag === 'main' ? { diag: o.diag } : {}),
    };
  }
  if (o.kind === 'draw') {
    const pts = Array.isArray(o.points)
      ? (o.points.filter(
          (p): p is [number, number] =>
            Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number',
        ) as Array<[number, number]>)
      : [];
    return {
      kind: 'draw',
      ...base,
      w: toFiniteNumber(o.w, 0),
      h: toFiniteNumber(o.h, 0),
      points: pts,
      stroke: typeof o.stroke === 'string' ? o.stroke : DRAW_COLORS[0]!,
      strokeWidth: toFiniteNumber(o.strokeWidth, DRAW_STROKE_WIDTH),
    };
  }
  if (o.kind === 'text') {
    return {
      kind: 'text',
      ...base,
      w: toFiniteNumber(o.w, TEXT_DEFAULT.w),
      h: toFiniteNumber(o.h, TEXT_DEFAULT.h),
      text: typeof o.text === 'string' ? o.text : '',
      color: typeof o.color === 'string' ? o.color : DRAW_COLORS[0]!,
      fontSize: toFiniteNumber(o.fontSize, TEXT_DEFAULT.fontSize),
    };
  }
  const widgetId =
    typeof o.widgetId === 'string' ? o.widgetId : typeof o.i === 'string' ? o.i : null;
  if (!widgetId) return null;
  return {
    kind: 'widget',
    id: typeof o.id === 'string' ? o.id : widgetId,
    widgetId,
    x,
    y,
    w: toFiniteNumber(o.w, 0),
    h: toFiniteNumber(o.h, 0),
    z,
  };
}

// Migra una disposición persistida completa, descartando entradas irrecuperables.
export function migrateFreeLayout(saved: readonly unknown[]): FreeLayout {
  return saved.map(migrateFreeElement).filter((e): e is FreeElement => e !== null);
}

// Reconcilia la disposición libre guardada con el catálogo actual. A diferencia del grid, el
// modo libre deja al usuario AÑADIR/QUITAR libremente, así que NO se fuerza la composición del
// preset: solo se siembra desde el preset cuando no hay nada guardado. Con datos guardados:
// conserva todo lo del usuario, mantiene las notas y descarta widgets de catálogo cuyo id ya no
// exista. Los widgets genéricos del agente (`gen:*`, #188/#189) se conservan SIEMPRE: no están en
// `ITEM_SPECS` (no son del catálogo fijo) sino que su spec vive en `LayoutPref.genericWidgets`, así
// que filtrarlos por el catálogo los borraba del lienzo (no se renderizaban ni en grid ni en libre).
export function reconcileFreeLayout(saved: readonly unknown[], preset: PresetDef): FreeLayout {
  const migrated = migrateFreeLayout(saved);
  if (migrated.length === 0) return buildDefaultFreeLayout(preset);
  // Notas/formas/trazos/textos se conservan siempre; los widgets se conservan si son del catálogo
  // (en ITEM_SPECS) o genéricos (`gen:*`). Solo se descartan ids de catálogo obsoletos.
  // Los widgets del catálogo se re-dimensionan al tamaño actual de ITEM_SPECS: el usuario no puede
  // redimensionarlos (solo las notas tienen handles de resize), así que el tamaño guardado puede
  // quedar desfasado cuando cambia ITEM_SPECS.
  return migrated
    .filter((e) => e.kind !== 'widget' || e.widgetId in ITEM_SPECS || e.widgetId.startsWith('gen:'))
    .map((e) => {
      if (e.kind !== 'widget' || !(e.widgetId in ITEM_SPECS)) return e;
      const size = freeItemSize(e.widgetId);
      if (e.w === size.w && e.h === size.h) return e;
      return { ...e, w: size.w, h: size.h };
    });
}

// Siguiente `z` (encima de todo).
function nextZ(layout: readonly FreeElement[]): number {
  return layout.reduce((m, e) => Math.max(m, e.z), -1) + 1;
}

// Ids de widgets del catálogo que NO están ya en el lienzo (para la paleta de "añadir").
export function availableWidgets(layout: readonly FreeElement[]): string[] {
  const present = new Set(
    layout.filter((e): e is FreeWidget => e.kind === 'widget').map((e) => e.widgetId),
  );
  return Object.keys(ITEM_SPECS).filter((id) => !present.has(id));
}

// Añade un widget centrado en `at` (coords de mundo). No-op si el id no existe o ya está.
export function addWidget(
  layout: FreeLayout,
  widgetId: string,
  at: { x: number; y: number },
): FreeLayout {
  if (!(widgetId in ITEM_SPECS)) return layout;
  if (layout.some((e) => e.kind === 'widget' && e.widgetId === widgetId)) return layout;
  const size = freeItemSize(widgetId);
  const el: FreeWidget = {
    kind: 'widget',
    id: widgetId,
    widgetId,
    x: at.x - size.w / 2,
    y: at.y - size.h / 2,
    w: size.w,
    h: size.h,
    z: nextZ(layout),
  };
  return [...layout, el];
}

// Añade un widget GENÉRICO (`gen:<uuid>`) al lienzo libre centrado en `at`. A diferencia de
// `addWidget`, no exige que el id esté en `ITEM_SPECS`: el tamaño (en unidades de grid) lo
// pasa el llamador desde `GenericSpec.defaultSize`. No-op si el widget ya está presente.
export function addGenericToFree(
  layout: FreeLayout,
  widgetId: string,
  at: { x: number; y: number },
  gridSize: { w: number; h: number },
): FreeLayout {
  if (layout.some((e) => e.kind === 'widget' && e.widgetId === widgetId)) return layout;
  const size = { w: gridSize.w * FREE_COL - FREE_GAP, h: gridSize.h * FREE_ROW - FREE_GAP };
  const el: FreeWidget = {
    kind: 'widget',
    id: widgetId,
    widgetId,
    x: at.x - size.w / 2,
    y: at.y - size.h / 2,
    w: size.w,
    h: size.h,
    z: nextZ(layout),
  };
  return [...layout, el];
}

// Añade una nota centrada en `at`. El `id` lo genera el llamador (crypto.randomUUID). `doc` es un
// documento TipTap (ProseMirror) inicial: null = nota vacía; el agente lo prellena (insight→nota).
// `size` permite una nota más holgada (p. ej. insights con varias frases) sin tocar NOTE_DEFAULT.
export function addNote(
  layout: FreeLayout,
  id: string,
  at: { x: number; y: number },
  color?: string,
  doc?: unknown,
  size?: { w: number; h: number },
): FreeLayout {
  const w = size?.w ?? NOTE_DEFAULT.w;
  const h = size?.h ?? NOTE_DEFAULT.h;
  const el: FreeNote = {
    kind: 'note',
    id,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    z: nextZ(layout),
    doc: doc ?? null,
    ...(color ? { color } : {}),
  };
  return [...layout, el];
}

// Añade una forma vectorial con su caja (bounding box) y estilo ya calculados por el llamador.
export function addShape(
  layout: FreeLayout,
  id: string,
  shape: ShapeKind,
  box: { x: number; y: number; w: number; h: number },
  opts: { stroke: string; strokeWidth: number; fill?: string; diag?: 'main' | 'anti' },
): FreeLayout {
  const el: FreeShape = {
    kind: 'shape',
    id,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z: nextZ(layout),
    shape,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
    ...(opts.fill ? { fill: opts.fill } : {}),
    ...(opts.diag ? { diag: opts.diag } : {}),
  };
  return [...layout, el];
}

// Añade un trazo a mano alzada a partir de puntos en coords de MUNDO ABSOLUTAS: calcula su
// bounding box (con margen para el grosor) y guarda los puntos RELATIVOS a la esquina. No-op
// si hay menos de 2 puntos.
export function addDraw(
  layout: FreeLayout,
  id: string,
  worldPoints: ReadonlyArray<readonly [number, number]>,
  stroke: string,
  strokeWidth: number,
): FreeLayout {
  if (worldPoints.length < 2) return layout;
  const pad = strokeWidth + 2;
  const xs = worldPoints.map((p) => p[0]);
  const ys = worldPoints.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  const el: FreeDraw = {
    kind: 'draw',
    id,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    z: nextZ(layout),
    points: worldPoints.map((p) => [p[0] - minX, p[1] - minY]),
    stroke,
    strokeWidth,
  };
  return [...layout, el];
}

// Añade un texto libre (cadena plana) con su esquina sup-izq en `at`.
export function addText(
  layout: FreeLayout,
  id: string,
  at: { x: number; y: number },
  color: string,
): FreeLayout {
  const el: FreeText = {
    kind: 'text',
    id,
    x: at.x,
    y: at.y,
    w: TEXT_DEFAULT.w,
    h: TEXT_DEFAULT.h,
    z: nextZ(layout),
    text: '',
    color,
    fontSize: TEXT_DEFAULT.fontSize,
  };
  return [...layout, el];
}

// Quita un elemento por id.
export function removeElement(layout: FreeLayout, id: string): FreeLayout {
  return layout.filter((e) => e.id !== id);
}

// Aplica un parche (posición, tamaño, contenido) a un elemento por id.
export function updateElement(
  layout: FreeLayout,
  id: string,
  patch: Partial<Omit<FreeBase, 'id'>> & {
    doc?: unknown;
    color?: string;
    text?: string;
    stroke?: string;
    fill?: string;
  },
): FreeLayout {
  return layout.map((e) => (e.id === id ? ({ ...e, ...patch } as FreeElement) : e));
}

// Trae un elemento al frente (z mayor que cualquiera).
export function bringToFront(layout: FreeLayout, id: string): FreeLayout {
  const top = nextZ(layout);
  return layout.map((e) => (e.id === id ? { ...e, z: top } : e));
}

// Reorganiza automáticamente todos los elementos en filas limpias (orden estable por z),
// fluyendo en un ancho de BOARD_COLS columnas como el layout por defecto.
export function autoArrangeFree(layout: FreeLayout): FreeLayout {
  const ordered = [...layout].sort((a, b) => a.z - b.z);
  const rowWidth = BOARD_COLS * FREE_COL;
  let x = 0;
  let y = 0;
  let rowH = 0;
  return ordered.map((e, idx) => {
    const advance = e.w + FREE_GAP;
    if (x + advance > rowWidth && x > 0) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const placed = { ...e, x, y, z: idx } as FreeElement;
    x += advance;
    rowH = Math.max(rowH, e.h + FREE_GAP);
    return placed;
  });
}
