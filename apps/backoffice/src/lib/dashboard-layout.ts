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

// Tamaño por defecto de cada widget, en UNIDADES de una rejilla FINA (2026-06-29): la celda mide
// FREE_COL×FREE_ROW px (25×40) en vez del bloque grueso anterior (100×160). Con la celda fina cada
// widget declara un ancho y un alto PROPIOS, tallados a su contenido y a su modo `fit` (ver
// PanelShell): los que ESTIRAN (tablas/listas/gráficas) piden el alto de su nº natural de filas; los
// que CENTRAN una figura (donut, gauge, cifra-héroe) piden una proporción que la abraza sin banda
// blanca. Ya NO hay tallas «de bloque» compartidas por sección: los 41 widgets tienen medidas únicas.
// La rejilla fina conserva el ENGANCHE (snap) y el teselado del modo Cuadrícula; el ancho de diseño
// (BOARD_COLS×FREE_COL = 48×25 = 1200) es el mismo de siempre, así que la maquetación macro no cambia.
export const BOARD_COLS = 48;
export const ITEM_SPECS: Record<string, { w: number; h: number }> = {
  // Clásicos: gráficas grandes (necesitan ancho para barras/eje y alto para respirar).
  'dash-bars': { w: 29, h: 9 },
  // "Ventas por hora": gráfico + barra fina de navegación; el gráfico llena el alto (dash-panel--fill).
  'dash-hour': { w: 29, h: 8 },
  // Sección 01 · KPIs (rediseño): banda conectada a todo lo ancho (baja) y tarjeta clásica compacta.
  'kpi-grid-connected': { w: 48, h: 5 },
  'kpi-classic': { w: 13, h: 4 },
  // Sección 02 · Gráficas (rediseño): área horaria, barras por tienda y heatmap (tira ancha-baja).
  'graf-hour-area': { w: 23, h: 8 },
  'graf-store-bars': { w: 24, h: 8 },
  'graf-heatmap': { w: 25, h: 6 },
  // Sección 03 · Listas (rediseño): ranking con barra (alto), pestañas+filas y mix apilado (más bajo).
  'lista-familia': { w: 16, h: 11 },
  'lista-rankings': { w: 17, h: 11 },
  'lista-mix': { w: 15, h: 9 },
  // Sección 04 · Más exploraciones (rediseño): objetivo (bullet ancho-bajo), métodos de pago (donut
  // ≈cuadrado con leyenda), tickets recientes (feed alto) y acumulado del mes (área ancha).
  'exp-objetivo': { w: 19, h: 6 },
  'exp-metodos-pago': { w: 13, h: 9 },
  'exp-tickets-recientes': { w: 15, h: 11 },
  'exp-acumulado-mes': { w: 22, h: 9 },
  // Sección 05 · Compactos (rediseño): banda, donut (≈cuadrado), treemap (ancho), top y cifra-héroe.
  'cmp-ribbon': { w: 13, h: 7 },
  'cmp-donut': { w: 12, h: 8 }, // anillo + total + leyenda: una fila más para que la leyenda no se corte.
  // Treemap: áreas 2D + nombres → ancho y medio-alto para que respiren.
  'cmp-treemap': { w: 20, h: 7 },
  'cmp-leaderboard': { w: 14, h: 11 },
  'cmp-hero': { w: 20, h: 6 }, // cifra gigante + área: ancha y baja.
  // Sección 06 · Diagnóstico (rediseño): feed de alertas (lista alta, muchas filas).
  'diag-actividad': { w: 15, h: 12 },
  // Sección 07 · KPIs · más formatos (rediseño): tarjetas cifra+sparkline, cada una con su talla.
  'kpi-dual': { w: 13, h: 6 }, // dos métricas apiladas → la más alta.
  'kpi-area': { w: 14, h: 6 }, // cifra + área al pie → algo más ancha.
  'kpi-alerta': { w: 12, h: 3 },
  'kpi-7dias': { w: 15, h: 5 }, // 7 mini-barras → ancha y baja.
  // Sección 08 · Mini gráficas (rediseño): tiles de bolsillo; cada viz pide su proporción.
  'mini-tiendas': { w: 10, h: 4 },
  'mini-tendencia': { w: 9, h: 4 }, // solo una línea → la más estrecha.
  'mini-acumulado': { w: 11, h: 4 },
  'mini-donut': { w: 12, h: 3 }, // rótulo + anillo (figura compacta, abraza el anillo).
  'mini-gauge': { w: 11, h: 3 }, // semicírculo → la más baja.
  'mini-familias': { w: 10, h: 5 }, // 3 filas de riel.
  'mini-heatmap': { w: 12, h: 3 }, // tira de 11 celdas: ancha-baja.
  'mini-columnas': { w: 12, h: 4 },
  // Sección 09 · Listas y tablas (rediseño): tarjetas de filas; ancho/alto según columnas y nº de filas.
  'tabla-simple': { w: 16, h: 8 },
  'tabla-avatar': { w: 18, h: 8 }, // avatar + nombre + valor → la más ancha.
  'tabla-estado': { w: 16, h: 9 },
  'tabla-variacion': { w: 17, h: 8 },
  'tabla-ranking': { w: 17, h: 9 },
  'tabla-tareas': { w: 18, h: 9 },
  // Sección 10 · Estado y progreso (rediseño): stepper ancho-bajo, badge pequeño y checklist.
  'estado-pasos': { w: 18, h: 3 }, // 4 pasos en horizontal → muy bajo.
  'estado-operativo': { w: 8, h: 4 }, // disco + N/N → el más pequeño.
  'estado-cumplimiento': { w: 13, h: 4 },
  // Sección 11 · Especializados (rediseño): comparativa, matriz 2D, directorio (alto) y banner ancho.
  'esp-proveedores': { w: 19, h: 10 }, // hasta 6 filas (nombre + 2 badges): alto para que ninguna se corte.
  'esp-matriz': { w: 19, h: 8 },
  'esp-tiendas': { w: 14, h: 10 },
  'esp-resumen-ejecutivo': { w: 37, h: 4 }, // banner ejecutivo a (casi) todo lo ancho (prosa + cifras).
};

const DEFAULT_SPEC = { w: 16, h: 8 };

// ── Límites de tamaño por widget (rejilla fina, 2026-06-29) ─────────────────────────────────────────
// Aunque los widgets son responsivos (llenan su tile vía el contrato `fit`), su TILE debe mantener un
// tamaño coherente con lo que el widget ES: una mini no crece a media pantalla, una tabla no queda
// ilegible, un donut no se deforma a ancho completo. Como ahora cada widget tiene su talla PROPIA
// (`ITEM_SPECS`), su rango se DERIVA de esa talla con una banda fija alrededor (en vez de mantener 41
// rangos a mano): así el rango es único por widget y el tamaño de catálogo SIEMPRE cae dentro de él por
// construcción (verificado por test). Se aplican al cargar/migrar cualquier layout (`migrateFreeElement`).
export interface SizeBounds {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}
// Suelo/techo genérico (widgets sin talla de catálogo: genéricos/compuestos del compositor IA).
export const DEFAULT_SIZE_BOUNDS: SizeBounds = { minW: 8, maxW: 32, minH: 4, maxH: 20 };

// Banda alrededor de la talla de catálogo (unidades de rejilla fina). Asimétrica: deja crecer algo
// más de lo que deja encoger, con suelos/techos que evitan tiles inservibles o desbordados.
const BOUND_SLACK = { wMinus: 4, wPlus: 8, hMinus: 2, hPlus: 5 } as const;
const MIN_BOUND_W = 6;
const MIN_BOUND_H = 2; // permite tiles muy bajos (badges, steppers, cifras sueltas) que abrazan su contenido
const MAX_BOUND_H = 24;
function deriveSizeBounds(w: number, h: number): SizeBounds {
  return {
    minW: Math.max(MIN_BOUND_W, w - BOUND_SLACK.wMinus),
    maxW: Math.min(BOARD_COLS, w + BOUND_SLACK.wPlus),
    minH: Math.max(MIN_BOUND_H, h - BOUND_SLACK.hMinus),
    maxH: Math.min(MAX_BOUND_H, h + BOUND_SLACK.hPlus),
  };
}
export const WIDGET_SIZE_BOUNDS: Record<string, SizeBounds> = Object.fromEntries(
  Object.entries(ITEM_SPECS).map(([id, s]) => [id, deriveSizeBounds(s.w, s.h)]),
);

// Rango de un widget (cae al genérico si no tiene propio).
export function widgetSizeBounds(id: string): SizeBounds {
  return WIDGET_SIZE_BOUNDS[id] ?? DEFAULT_SIZE_BOUNDS;
}
// Clampa un tamaño en UNIDADES de rejilla al rango coherente del widget.
export function clampWidgetUnits(
  id: string,
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  const b = widgetSizeBounds(id);
  return {
    cols: Math.min(b.maxW, Math.max(b.minW, Math.round(cols))),
    rows: Math.min(b.maxH, Math.max(b.minH, Math.round(rows))),
  };
}

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
  table: { w: 24, h: 12 },
  bar: { w: 24, h: 8 },
  line: { w: 24, h: 8 },
  area: { w: 24, h: 8 },
  stacked: { w: 24, h: 8 },
  pie: { w: 16, h: 12 },
  donut: { w: 16, h: 12 },
  kpi: { w: 8, h: 4 },
  insight: { w: 20, h: 8 },
  composite: { w: 32, h: 20 },
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
  lg: 48,
  md: 48,
  sm: 24,
  xs: 16,
  xxs: 8,
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
// Traducción de unidades de rejilla a píxeles de mundo para sembrar el lienzo. La celda es FINA
// (FREE_COL×FREE_ROW = 25×40 px) para que cada widget pueda tener una talla A MEDIDA y aun así
// ENGANCHE (snap) a una rejilla regular. Cada item descuenta un hueco (FREE_GAP, el gutter) de su
// tamaño, de modo que la disposición inicial replica la del grid pero a píxel.
export const FREE_COL = 25;
export const FREE_ROW = 40;
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

// Clampa un tamaño en PÍXELES del lienzo al rango coherente del widget: pasa a unidades de rejilla
// (`freeUnitsFromPx`), acota a [minW,maxW]×[minH,maxH] (`clampWidgetUnits`) y vuelve a píxeles de mundo.
// Es la barrera que aplica los límites a CUALQUIER tamaño que entre por un layout guardado/compuesto.
export function clampWidgetPx(id: string, w: number, h: number): { w: number; h: number } {
  const { cols, rows } = freeUnitsFromPx(w, h);
  const c = clampWidgetUnits(id, cols, rows);
  return { w: c.cols * FREE_COL - FREE_GAP, h: c.rows * FREE_ROW - FREE_GAP };
}

// ── Modo CUADRÍCULA: rejilla GRUESA y regular ────────────────────────────────────────────────────
// El lienzo libre usa las tallas A MEDIDA (rejilla fina 48 col / 40px fila). El modo Cuadrícula, en
// cambio, debe verse como una REJILLA limpia y regular (con gutter), no como un mosaico irregular. Por
// eso CUANTIZA las tallas finas a una rejilla gruesa: 1 unidad gruesa = GRID_COARSEN finas (×4). Resulta
// la misma rejilla regular de 12 columnas / filas de ~156px de siempre, pero alimentada por las tallas
// a medida (cada widget redondea a su nº entero de celdas gruesas). Free = a medida; grid = ordenado.
export const GRID_COARSEN = 4;
export const GRID_COARSE_COLS = BOARD_COLS / GRID_COARSEN; // 12
export const GRID_COARSE_COLS_NARROW = 3; // móvil: bloques (todos ≥2 gruesas) a fila completa, apilados
// Cuantiza una talla en unidades FINAS a unidades GRUESAS (redondeo al entero de celda más cercano,
// mínimo 1, ancho capado a GRID_COARSE_COLS). Lo usa GridBoard para teselar regular.
export function gridCoarseUnits(
  fineCols: number,
  fineRows: number,
): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.min(GRID_COARSE_COLS, Math.round(fineCols / GRID_COARSEN))),
    rows: Math.max(1, Math.round(fineRows / GRID_COARSEN)),
  };
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
  // Tamaño persistido → clamp a los límites coherentes del widget. Un tamaño ausente/0 cae a su tamaño
  // de catálogo (`freeItemSize`) antes de clampar, así nunca queda invisible (w/h=0).
  const def = freeItemSize(widgetId);
  const rawW = toFiniteNumber(o.w, 0);
  const rawH = toFiniteNumber(o.h, 0);
  const sized = clampWidgetPx(widgetId, rawW > 0 ? rawW : def.w, rawH > 0 ? rawH : def.h);
  return {
    kind: 'widget',
    id: typeof o.id === 'string' ? o.id : widgetId,
    widgetId,
    x,
    y,
    w: sized.w,
    h: sized.h,
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
  // El tamaño guardado de un widget de catálogo se CLAMPA a sus límites (`WIDGET_SIZE_BOUNDS`) en vez de
  // forzar la talla exacta de ITEM_SPECS: así sobrevive el tamaño que el motor de auto-maquetación
  // (`autoArrangeFree`) calculó al estirar/encoger dentro de límites, y cualquier talla guardada fuera
  // de rango (o desfasada) se corrige al rango coherente del widget.
  return migrated
    .filter((e) => e.kind !== 'widget' || e.widgetId in ITEM_SPECS || e.widgetId.startsWith('gen:'))
    .map((e) => {
      if (e.kind !== 'widget' || !(e.widgetId in ITEM_SPECS)) return e;
      const sized = clampWidgetPx(e.widgetId, e.w, e.h);
      if (e.w === sized.w && e.h === sized.h) return e;
      return { ...e, w: sized.w, h: sized.h };
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

// ── Motor de auto-maquetación: COMPACTACIÓN POR FILAS JUSTIFICADAS ──────────────────────────────
// Empaquetado profesional documentado (ver docs/dashboard-auto-layout-rules.md): combina filas
// justificadas (estilo Flickr justified-layout) + compactación vertical (react-grid-layout / Gridstack)
// + auto-grid (Grafana) + tiled/distribute (Tableau/QuickSight), acotado por WIDGET_SIZE_BOUNDS y con
// guarda de aspecto (squarified). Trabaja en UNIDADES DE COLUMNA FINA sobre una tira de BOARD_COLS; el
// gutter (FREE_GAP) es automático entre tiles contiguos (tile_px = u·CELDA − GAP). Garantiza: filas a
// todo el ancho (sin borde derecho irregular), tops/bottoms de fila alineados (bordes regulares), sin
// huecos verticales, y estirado SOLO dentro de límites (sin deformar). Determinista (mismo input →
// mismo layout). Solo los WIDGETS se estiran; notas/formas/trazos/textos se reubican a tamaño natural.
const ARRANGE_MAX_PER_ROW = 4; // tope por fila (legibilidad) en desktop
const ARRANGE_FULL_WIDTH = 44; // a partir de este ancho (col finas) el widget va en fila propia

interface ArrangeCell {
  e: FreeElement;
  cols: number;
  rows: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  stretch: boolean;
}

function arrangeCell(e: FreeElement): ArrangeCell {
  const u = freeUnitsFromPx(e.w, e.h);
  if (e.kind === 'widget') {
    const b = widgetSizeBounds(e.widgetId);
    return {
      e,
      cols: Math.min(b.maxW, Math.max(b.minW, u.cols)),
      rows: Math.min(b.maxH, Math.max(b.minH, u.rows)),
      minW: b.minW,
      maxW: b.maxW,
      minH: b.minH,
      maxH: b.maxH,
      stretch: true,
    };
  }
  // No-widget (nota/forma/trazo/texto): tamaño fijo, no se estira.
  return {
    e,
    cols: u.cols,
    rows: u.rows,
    minW: u.cols,
    maxW: u.cols,
    minH: u.rows,
    maxH: u.rows,
    stretch: false,
  };
}

export function autoArrangeFree(layout: FreeLayout): FreeLayout {
  const cells = [...layout].sort((a, b) => a.z - b.z).map(arrangeCell);

  // 1. SHELF-PACK en orden de lectura (z): agrupa en filas respetando el ancho del tablero y el tope
  //    por fila; un widget de ancho casi completo ocupa su propia fila.
  const rows: ArrangeCell[][] = [];
  let cur: ArrangeCell[] = [];
  let curCols = 0;
  for (const c of cells) {
    if (c.cols >= ARRANGE_FULL_WIDTH) {
      if (cur.length) {
        rows.push(cur);
        cur = [];
        curCols = 0;
      }
      rows.push([c]);
      continue;
    }
    if (cur.length >= ARRANGE_MAX_PER_ROW || curCols + c.cols > BOARD_COLS) {
      if (cur.length) rows.push(cur);
      cur = [];
      curCols = 0;
    }
    cur.push(c);
    curCols += c.cols;
  }
  if (cur.length) rows.push(cur);

  // 2. Justifica el ANCHO (crece hacia maxW; resto → espaciado), iguala el ALTO de fila (banda = alto
  //    natural máximo; cada uno crece hasta min(banda,maxH) y se centra si no llega) y apila las filas
  //    en VERTICAL sin huecos.
  const out: FreeElement[] = [];
  let yPx = 0;
  let z = 0;
  for (const row of rows) {
    // Ancho: water-filling — crece 1 col cada vez al de más holgura (maxW − cols); empates → izquierda.
    let leftover = BOARD_COLS - row.reduce((s, c) => s + c.cols, 0);
    while (leftover > 0) {
      let best = -1;
      let bestRoom = 0;
      for (let i = 0; i < row.length; i++) {
        const room = row[i]!.stretch ? row[i]!.maxW - row[i]!.cols : 0;
        if (room > bestRoom) {
          bestRoom = room;
          best = i;
        }
      }
      if (best < 0) break; // nadie puede crecer más
      row[best]!.cols += 1;
      leftover -= 1;
    }
    // Residual (todos al máximo) → repartir como espaciado uniforme entre tiles.
    const gapCols = leftover > 0 && row.length > 1 ? leftover / (row.length - 1) : 0;
    // Alto: banda = alto natural máximo de la fila.
    const bandRows = Math.max(...row.map((c) => c.rows));

    let xCols = 0;
    for (const c of row) {
      const cellRows = c.stretch ? Math.min(c.maxH, Math.max(c.minH, bandRows)) : c.rows;
      const yOffsetPx = ((bandRows - cellRows) / 2) * FREE_ROW; // centra en la banda si no llega
      out.push({
        ...c.e,
        x: Math.round(xCols) * FREE_COL,
        y: Math.round(yPx + yOffsetPx),
        w: c.cols * FREE_COL - FREE_GAP,
        h: cellRows * FREE_ROW - FREE_GAP,
        z: z++,
      } as FreeElement);
      xCols += c.cols + gapCols;
    }
    yPx += bandRows * FREE_ROW;
  }
  return out;
}
