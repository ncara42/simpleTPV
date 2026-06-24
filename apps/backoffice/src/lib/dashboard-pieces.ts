// Fuente ÚNICA del vocabulario v2 del dashboard (#204, EPIC #201): allowlist de piezas, recetas
// cerradas, slots tipados, inferencia de formato y tamaños por receta. La normalización del store
// (normalizePanelSpec) consume todo esto para REPARAR (clampar enums, inferir formato, reubicar
// piezas por slot) en vez de podar. El backend (F5) debe mantener PARIDAD con estas listas.

import type {
  GenericSpec,
  PieceFormat,
  PieceId,
  PieceSpec,
  RecipeId,
  SlotName,
} from './dashboard-layout.js';

// Piezas válidas que el agente puede colocar en un slot (cada una con diseño horneado).
export const PIECE_ALLOWLIST: ReadonlySet<PieceId> = new Set<PieceId>([
  'kpiTile',
  'comparisonBars',
  'trendLine',
  'trendArea',
  'shareDonut',
  'rankBarList',
  'segmentBar',
  'progressMeter',
  'stockAlertList',
  'dataGrid',
]);

// Recetas cerradas. El orden importa para el clamp por nº de slots (la primera que encaja gana).
export const RECIPE_ALLOWLIST: readonly RecipeId[] = [
  'kpiRow',
  'kpiRow+oneChart',
  'kpiRow+twoCharts',
  'heroChart+sideStats',
  'tableFull',
];

// Allowlist de endpoints (solo lectura/GET) que puede apuntar una hoja/pieza. ESPEJO de
// `WIDGETABLE_ENDPOINTS` del backend (crates/domain/src/chat/context.rs) y del contrato
// docs/contracts/dataviz-contract.json — la PARIDAD se verifica en tests a ambos lados (#206).
// Cualquier endpoint fuera de esta lista se poda (única poda dura: defensa RLS/input no confiable).
export const WIDGETABLE_ENDPOINTS: ReadonlySet<string> = new Set<string>([
  '/dashboard/sales-by-family',
  '/dashboard/sales-by-hour',
  '/dashboard/sales-by-employee',
  '/dashboard/sales-by-store',
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

// Slot → piezas admitidas. `kpis` solo kpiTile; `charts` el set de gráficas/listas/tablas. Una
// pieza en el slot equivocado se REUBICA al slot que la admita; si ninguno, se descarta esa pieza.
export const SLOT_PIECES: Record<SlotName, ReadonlySet<PieceId>> = {
  kpis: new Set<PieceId>(['kpiTile']),
  charts: new Set<PieceId>([
    'comparisonBars',
    'trendLine',
    'trendArea',
    'shareDonut',
    'rankBarList',
    'segmentBar',
    'progressMeter',
    'stockAlertList',
    'dataGrid',
  ]),
};

// Tamaño por defecto (unidades de grid, BOARD_COLS=12) por receta. Sustituye el `default_size` libre
// del agente: la receta dicta la geometría. El agente nunca emite w/h.
// Anchos RECIPE-AWARE (grid responsive, no muro de tarjetas idénticas): los paneles compactos van a
// MEDIA anchura (w:6) → tilean 2-up como el grid de Tremor (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
// y dan jerarquía/ritmo (Carbon: priorizar por importancia + white space); los internamente densos
// (2 gráficas, hero+stats) ocupan el ANCHO COMPLETO. La mezcla ancho/medio crea composición bento.
export const RECIPE_SIZE: Record<RecipeId, { w: number; h: number }> = {
  kpiRow: { w: 6, h: 1 }, // banda de KPIs (1-4 tiles) → media anchura
  'kpiRow+oneChart': { w: 6, h: 3 }, // KPIs + 1 gráfica → tarjeta media (2-up)
  // Gráficas COMPACTAS (estilo widget "Ventas", h:2): banda KPI (~1 fila) + ~2 filas de gráfica.
  // Antes h:5 → las gráficas se estiraban demasiado a lo alto (feedback del usuario).
  'kpiRow+twoCharts': { w: 12, h: 3 }, // 2 gráficas en paralelo → ancho completo
  'heroChart+sideStats': { w: 12, h: 3 }, // gráfica hero + stats (split 2fr/1fr) → ancho completo
  tableFull: { w: 6, h: 4 }, // ranking/tabla → media anchura (BarList se lee bien medio)
};

export const PIECE_FORMATS: readonly PieceFormat[] = [
  'eur',
  'percent',
  'percentRatio',
  'decimal',
  'units',
  'integer',
];

// Caps por defecto (clampados). El agente puede pedir menos; nunca más.
export const MAX_BARS = 8;
export const MAX_ROWS = 10;

// Densidades válidas.
export const DENSITIES = ['compact', 'comfortable'] as const;

// Devuelve la receta válida si coincide; si no, null (el caller clampa por nº de slots).
export function asRecipe(v: unknown): RecipeId | null {
  return typeof v === 'string' && (RECIPE_ALLOWLIST as readonly string[]).includes(v)
    ? (v as RecipeId)
    : null;
}

// Conteo de piezas por slot, usado para derivar/validar la receta.
export interface SlotCounts {
  kpis: number;
  charts: number;
  firstChartIsTable: boolean;
}

// Deriva la receta más cercana según qué slots traen piezas. Sin charts → kpiRow; 1 chart →
// kpiRow+oneChart; ≥2 charts → kpiRow+twoCharts; solo charts (sin kpis) y 1 pieza → tableFull si es
// dataGrid, si no heroChart+sideStats.
export function deriveRecipe(counts: SlotCounts): RecipeId {
  if (counts.charts === 0) return 'kpiRow';
  if (counts.charts >= 2) return 'kpiRow+twoCharts';
  // exactamente 1 chart
  if (counts.kpis === 0) return counts.firstChartIsTable ? 'tableFull' : 'heroChart+sideStats';
  return 'kpiRow+oneChart';
}

// ¿La receta encaja con el nº de charts? El layout de cada receta lo dicta el nº de columnas de
// charts, así que validar por `counts.charts` evita geometrías contradictorias (p. ej. kpiRow con
// 4 charts → 1 fila apretada). kpiRow = solo kpis; oneChart/hero/tableFull = 1 chart; twoCharts ≥2.
export function recipeFits(recipe: RecipeId, counts: SlotCounts): boolean {
  switch (recipe) {
    case 'kpiRow':
      return counts.charts === 0;
    case 'kpiRow+oneChart':
    case 'heroChart+sideStats':
    case 'tableFull':
      return counts.charts === 1;
    case 'kpiRow+twoCharts':
      return counts.charts >= 2;
  }
}

// Clampa la receta: respeta la explícita SOLO si es válida y encaja con los counts; si no (inválida
// o contradictoria con el nº de piezas), la re-deriva. El caller (store) emite un `reason` cuando el
// resultado difiere de lo pedido, para que el desajuste vuelva al LLM (#212).
export function clampRecipe(raw: unknown, counts: SlotCounts): RecipeId {
  const exact = asRecipe(raw);
  if (exact && recipeFits(exact, counts)) return exact;
  return deriveRecipe(counts);
}

// Nº de columnas de charts que dicta la receta (1 o 2). El layout deriva de aquí, no del agente.
export function recipeChartColumns(recipe: RecipeId): 1 | 2 {
  return recipe === 'kpiRow+twoCharts' ? 2 : 1;
}

// Tamaños (grid 12-col) de cada pieza al SEPARAR un panel en widgets sueltos: KPI estrecho como una
// card de catálogo; listas/tablas algo más altas; gráficas media anchura.
const PIECE_SOLO_SIZE = {
  kpi: { w: 2, h: 1 },
  list: { w: 5, h: 3 },
  chart: { w: 5, h: 2 },
} as const;
const LIST_PIECES: ReadonlySet<PieceId> = new Set<PieceId>([
  'rankBarList',
  'stockAlertList',
  'dataGrid',
]);

// Descompone un panel v2 multi-pieza en N specs de UNA sola pieza (cada uno un widget INDEPENDIENTE:
// su propia tarjeta, movible y borrable por separado). Cada pieza conserva su binding (endpoint/campos/
// formato/título). Receta `kpiRow` para un KPI; `tableFull` para una gráfica/lista (renderiza una
// pieza a lo ancho, limpio). Devuelve `[spec]` sin tocar si NO es un panel multi-pieza.
export function decomposePanelSpec(spec: GenericSpec): GenericSpec[] {
  if (spec.kind !== 'panel' || !spec.slots) return [spec];
  const flat: { slot: SlotName; piece: PieceSpec }[] = [];
  for (const slot of ['kpis', 'charts'] as SlotName[]) {
    for (const piece of spec.slots[slot] ?? []) flat.push({ slot, piece });
  }
  if (flat.length <= 1) return [spec];
  return flat.map(({ slot, piece }) => {
    const isKpi = slot === 'kpis';
    const sizeKey = isKpi ? 'kpi' : LIST_PIECES.has(piece.piece) ? 'list' : 'chart';
    return {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: piece.title ?? '',
      defaultSize: { ...PIECE_SOLO_SIZE[sizeKey] },
      recipe: isKpi ? 'kpiRow' : 'tableFull',
      density: spec.density ?? 'comfortable',
      slots: { [slot]: [piece] },
    } satisfies GenericSpec;
  });
}

// El slot que admite una pieza dada (kpis o charts), o null si ninguna la admite.
export function slotForPiece(piece: PieceId): SlotName | null {
  if (SLOT_PIECES.kpis.has(piece)) return 'kpis';
  if (SLOT_PIECES.charts.has(piece)) return 'charts';
  return null;
}

// Inferencia de formato por nombre de campo (cuando el agente omite `format`). Heurística es-ES
// del negocio. ORDEN IMPORTANTE: las tasas/conteos se comprueban ANTES que los importes, porque la
// keyword de eur es un substring no anclado (`ticketCount`/`salesUnits` NO deben salir eur). Es
// best-effort: con F5 el agente pasa `format` explícito (enum) y esta heurística solo es fallback.
export function inferFormat(field: string | undefined): PieceFormat | undefined {
  if (!field) return undefined;
  const f = field.toLowerCase();
  // 1) Porcentajes/tasas (sufijo o keyword) — antes que eur. Los campos de tasa del dashboard
  // (discountRate, returnRate, avgDiscountPct, marginPct, stockout rate) llegan como fracción
  // 0..1, así que se infiere `percentRatio` (×100). `percent` (0..100) queda para uso explícito (#208).
  if (/(pct|percent|porcentaje)/.test(f) || /rate$/.test(f) || /ratio$/.test(f)) {
    return 'percentRatio';
  }
  // 2) Ratios "por ticket"/upt → decimal.
  if (f === 'upt' || /perticket|por_ticket|peritem/.test(f)) return 'decimal';
  // 3) Unidades/conteos → units (gana al substring eur: `ticketCount`, `salesUnits`).
  if (/(units|unidades|count|qty|quantity|cantidad|stock)/.test(f)) return 'units';
  // 4) Importes → eur (ya descartados conteos/ratios).
  if (
    /(revenue|amount|ticket|sales|profit|margin|cost|price|importe|venta|total|ingreso)/.test(f)
  ) {
    return 'eur';
  }
  return undefined;
}

// Clampa un entero a [min,max]; devuelve undefined si no es un número finito (la molécula usa su
// default horneado).
export function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Valida/clampa un formato; null si no es válido (el caller infiere o usa el default de la molécula).
export function asFormat(v: unknown): PieceFormat | null {
  return typeof v === 'string' && (PIECE_FORMATS as readonly string[]).includes(v)
    ? (v as PieceFormat)
    : null;
}
