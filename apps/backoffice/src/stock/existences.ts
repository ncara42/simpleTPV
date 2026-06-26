// Lógica pura de la vista «Existencias» (sin React). Toma el stock global por
// producto (cada producto con su stock en cada tienda), el catálogo y el árbol de
// familias y produce:
//   · filas enriquecidas (familia raíz, rotación, stock por tienda),
//   · el cálculo del nivel (sano/bajo/agotado) según el ÁMBITO (una tienda o todas),
//   · recuentos de cada faceta (vista · familia · rotación) dependientes del ámbito,
//   · el filtrado combinado y la agrupación por familia raíz con su total de unidades.
// Probada de forma aislada en existences.test.ts.

import type { Rotation, StockGlobalRow } from '@simpletpv/auth';

import type { FamilyNode } from '../lib/families.js';
import { findNodePath } from '../lib/family-tree.js';
import type { Product } from '../lib/products.js';

// Nivel de existencias de un producto en un ámbito: agotado (0), bajo (≤ mínimo),
// sano (> mínimo). Mismo umbral relativo al mínimo que usa el badge de la tabla.
export type ExLevel = 'ok' | 'low' | 'out';

export function levelOf(qty: number, min: number): ExLevel {
  if (qty <= 0) return 'out';
  if (qty <= min) return 'low';
  return 'ok';
}

// Vistas guardadas (filtros rápidos de una sola selección).
export type ExView = 'all' | 'low' | 'out';
export const EX_VIEWS: readonly ExView[] = ['all', 'low', 'out'];

// Ámbito de tienda: conjunto de tiendas seleccionadas para agregar el stock.
// Vacío = todas las tiendas (suma global); una o varias = suma de las elegidas.
export type Scope = ReadonlySet<string>;

const ROTATIONS: readonly Rotation[] = ['alta', 'media', 'baja'];
export const ALL_ROTATIONS = ROTATIONS;

export interface ExStore {
  storeId: string;
  storeName: string;
  quantity: number;
  minStock: number;
}

// Fila lista para la vista: producto + familia raíz + rotación + su stock por tienda.
export interface ExRow {
  productId: string;
  name: string;
  rootFamily: FamilyNode | null;
  rotation: Rotation;
  stores: ExStore[];
}

// Resultado de aplicar un ámbito a una fila: lo disponible, el mínimo y el nivel.
export interface ScopeResult {
  disp: number;
  min: number;
  level: ExLevel;
}

export interface ExFamilyFacet {
  family: FamilyNode;
  count: number;
}

export interface ExFacetCounts {
  views: Record<ExView, number>;
  families: ExFamilyFacet[];
  rotations: Record<Rotation, number>;
}

export interface ExFilters {
  view: ExView;
  families: ReadonlySet<string>; // ids de familia raíz; vacío = todas
  rotations: ReadonlySet<Rotation>; // vacío = todas
}

export const EMPTY_EX_FILTERS: ExFilters = {
  view: 'all',
  families: new Set(),
  rotations: new Set(),
};

// Grupo de la tabla: una familia raíz con sus filas y el total de unidades del ámbito.
export interface ExGroup {
  family: FamilyNode | null; // null = «Sin familia», siempre al final
  rows: ExRow[];
  totalUnits: number;
}

// Índice familiaId → familia RAÍZ (cada raíz mapeada a sí misma). Evita recalcular
// el camino por producto cuando hay muchos.
function buildRootIndex(families: FamilyNode[]): Map<string, FamilyNode> {
  const index = new Map<string, FamilyNode>();
  const walk = (node: FamilyNode, root: FamilyNode): void => {
    index.set(node.id, root);
    for (const child of node.children) walk(child, root);
  };
  for (const root of families) walk(root, root);
  return index;
}

// Une el stock global (nombre, rotación, stock por tienda) con el catálogo (para la
// familia) y resuelve la familia raíz de cada producto.
export function buildExRows(
  stockRows: StockGlobalRow[],
  products: Product[],
  families: FamilyNode[],
): ExRow[] {
  const rootIndex = buildRootIndex(families);
  const familyOfProduct = new Map(products.map((p) => [p.id, p.familyId]));
  // findNodePath como respaldo si el id no estuviera en el índice (árbol desincronizado).
  const rootOf = (familyId: string | null): FamilyNode | null => {
    if (!familyId) return null;
    const indexed = rootIndex.get(familyId);
    if (indexed) return indexed;
    const path = findNodePath(families, familyId);
    return path[0] ?? null;
  };

  return stockRows.map((row) => ({
    productId: row.productId,
    name: row.productName,
    rootFamily: rootOf(familyOfProduct.get(row.productId) ?? null),
    rotation: row.rotation,
    stores: row.stores.map((st) => ({
      storeId: st.storeId,
      storeName: st.storeName,
      quantity: Number(st.quantity),
      minStock: Number(st.minStock),
    })),
  }));
}

// Aplica un ámbito a una fila: suma cantidades y mínimos de las tiendas del ámbito
// (todas si el conjunto está vacío; si no, solo las seleccionadas). El nivel se calcula
// sobre la suma resultante.
export function scopeOf(row: ExRow, scope: Scope): ScopeResult {
  const relevant = scope.size === 0 ? row.stores : row.stores.filter((s) => scope.has(s.storeId));
  let disp = 0;
  let min = 0;
  for (const st of relevant) {
    disp += st.quantity;
    min += st.minStock;
  }
  return { disp, min, level: levelOf(disp, min) };
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Filtra por término de búsqueda sobre el nombre del producto (sin tildes, parcial).
export function searchRows(rows: ExRow[], term: string): ExRow[] {
  const q = norm(term.trim());
  if (!q) return rows;
  return rows.filter((r) => norm(r.name).includes(q));
}

function passFamily(row: ExRow, families: ReadonlySet<string>): boolean {
  return families.size === 0 || (row.rootFamily != null && families.has(row.rootFamily.id));
}

function passRotation(row: ExRow, rotations: ReadonlySet<Rotation>): boolean {
  return rotations.size === 0 || rotations.has(row.rotation);
}

// Filas tras aplicar familia + rotación (NO la vista): base de los recuentos de vista.
export function applyFamilyRotation(rows: ExRow[], filters: ExFilters): ExRow[] {
  return rows.filter((r) => passFamily(r, filters.families) && passRotation(r, filters.rotations));
}

// Filas mostradas: las anteriores acotadas por la vista (nivel según el ámbito).
export function applyView(rows: ExRow[], view: ExView, scope: Scope): ExRow[] {
  if (view === 'all') return rows;
  return rows.filter((r) => scopeOf(r, scope).level === view);
}

// Recuentos de las facetas. Familia y rotación se cuentan sobre `searched` (antes de
// seleccionar familia/rotación) para que el usuario vea siempre cuántos hay de cada
// una; las vistas se cuentan sobre `afterFamilyRotation` con el nivel del ámbito.
export function computeExFacets(
  searched: ExRow[],
  afterFamilyRotation: ExRow[],
  families: FamilyNode[],
  scope: Scope,
): ExFacetCounts {
  const views: Record<ExView, number> = { all: afterFamilyRotation.length, low: 0, out: 0 };
  for (const r of afterFamilyRotation) {
    const level = scopeOf(r, scope).level;
    if (level === 'low') views.low += 1;
    if (level === 'out') views.out += 1;
  }

  const rotations: Record<Rotation, number> = { alta: 0, media: 0, baja: 0 };
  const familyCount = new Map<string, number>();
  for (const r of searched) {
    rotations[r.rotation] += 1;
    if (r.rootFamily) familyCount.set(r.rootFamily.id, (familyCount.get(r.rootFamily.id) ?? 0) + 1);
  }

  const familyFacets: ExFamilyFacet[] = families
    .map((family) => ({ family, count: familyCount.get(family.id) ?? 0 }))
    .filter((f) => f.count > 0);

  return { views, families: familyFacets, rotations };
}

// Agrupa por familia raíz, en orden de familia (sortOrder · nombre); «Sin familia» al
// final. El total de unidades del grupo se calcula en el ámbito activo.
export function groupExRows(rows: ExRow[], families: FamilyNode[], scope: Scope): ExGroup[] {
  const order = new Map<string, number>();
  families.forEach((f, i) => order.set(f.id, f.sortOrder ?? i));

  const byFamily = new Map<string, ExRow[]>();
  const orphans: ExRow[] = [];
  for (const row of rows) {
    if (!row.rootFamily) {
      orphans.push(row);
      continue;
    }
    const bucket = byFamily.get(row.rootFamily.id);
    if (bucket) bucket.push(row);
    else byFamily.set(row.rootFamily.id, [row]);
  }

  const unitsOf = (groupRows: ExRow[]): number =>
    groupRows.reduce((sum, r) => sum + scopeOf(r, scope).disp, 0);

  const groups: ExGroup[] = [...byFamily.values()].map((groupRows) => ({
    family: groupRows[0]!.rootFamily,
    rows: groupRows,
    totalUnits: unitsOf(groupRows),
  }));

  groups.sort((a, b) => {
    const oa = order.get(a.family!.id) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b.family!.id) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.family!.name.localeCompare(b.family!.name);
  });

  if (orphans.length) {
    groups.push({ family: null, rows: orphans, totalUnits: unitsOf(orphans) });
  }
  return groups;
}

// Color de familia: token CSS dark-aware (--fam-c-0..7, Radix paso-11, light+dark).
// Hash del id → índice estable, independiente del orden. Lo usan el punto del carril
// y el de la cabecera de grupo para que ambos coincidan con la etiqueta de familia.
export function familyColorVar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `var(--fam-c-${h % 8})`;
}

// ── Etiquetas de presentación ──────────────────────────────────────────────────
export const ROTATION_LABELS: Record<Rotation, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export const LEVEL_LABELS: Record<ExLevel, string> = {
  ok: 'En stock',
  low: 'Bajo mínimo',
  out: 'Sin stock',
};

export const VIEW_LABELS: Record<ExView, string> = {
  all: 'Todo el catálogo',
  low: 'Bajo mínimo',
  out: 'Sin stock',
};
