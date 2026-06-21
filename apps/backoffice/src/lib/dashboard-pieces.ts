// Fuente ÚNICA del vocabulario v2 del dashboard (#204, EPIC #201): allowlist de piezas, recetas
// cerradas, slots tipados, inferencia de formato y tamaños por receta. La normalización del store
// (normalizePanelSpec) consume todo esto para REPARAR (clampar enums, inferir formato, reubicar
// piezas por slot) en vez de podar. El backend (F5) debe mantener PARIDAD con estas listas.

import type { PieceFormat, PieceId, RecipeId, SlotName } from './dashboard-layout.js';

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
    'dataGrid',
  ]),
};

// Tamaño por defecto (unidades de grid) por receta. Sustituye el `default_size` libre del agente:
// la receta dicta la geometría. El agente nunca emite w/h.
export const RECIPE_SIZE: Record<RecipeId, { w: number; h: number }> = {
  kpiRow: { w: 8, h: 1 },
  'kpiRow+oneChart': { w: 6, h: 4 },
  'kpiRow+twoCharts': { w: 8, h: 5 },
  'heroChart+sideStats': { w: 8, h: 5 },
  tableFull: { w: 6, h: 5 },
};

export const PIECE_FORMATS: readonly PieceFormat[] = [
  'eur',
  'percent',
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

// Clampa una receta inválida a la más cercana según qué slots traen piezas. Sin charts → kpiRow;
// 1 chart → kpiRow+oneChart; ≥2 charts → kpiRow+twoCharts; solo charts (sin kpis) y 1 pieza →
// tableFull si es dataGrid, si no heroChart+sideStats.
export function clampRecipe(
  raw: unknown,
  counts: { kpis: number; charts: number; firstChartIsTable: boolean },
): RecipeId {
  const exact = asRecipe(raw);
  if (exact) return exact;
  if (counts.charts === 0) return 'kpiRow';
  if (counts.charts >= 2) return 'kpiRow+twoCharts';
  // exactamente 1 chart
  if (counts.kpis === 0) return counts.firstChartIsTable ? 'tableFull' : 'heroChart+sideStats';
  return 'kpiRow+oneChart';
}

// Nº de columnas de charts que dicta la receta (1 o 2). El layout deriva de aquí, no del agente.
export function recipeChartColumns(recipe: RecipeId): 1 | 2 {
  return recipe === 'kpiRow+twoCharts' ? 2 : 1;
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
  // 1) Porcentajes/tasas (sufijo o keyword) — antes que eur.
  if (/(pct|percent|porcentaje)/.test(f) || /rate$/.test(f) || /ratio$/.test(f)) return 'percent';
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
