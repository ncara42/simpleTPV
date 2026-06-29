// Lógica pura de la vista facetada + agrupada del Catálogo (sin React). Toma los
// productos, el árbol de familias y la rotación/stock por producto y produce:
//   · filas enriquecidas (familia raíz, stock total, rotación, estado, margen),
//   · grupos por familia raíz (con total de unidades),
//   · recuentos de cada faceta (familia · estado de stock · rotación · vistas),
//   · el filtrado combinado por las facetas seleccionadas.
// Probada de forma aislada en facets.test.ts.

import type { Rotation } from '@simpletpv/auth';

import type { FamilyNode } from '../lib/families.js';
import { findNodePath } from '../lib/family-tree.js';
import type { Product } from '../lib/products.js';

// Estado de stock de un producto a partir de sus unidades totales. Mismo umbral que
// el tag de la tabla: agotado (0), bajo (≤5), sano (>5). Color SOLO donde significa.
export type StockState = 'ok' | 'low' | 'out';
export function stockState(qty: number): StockState {
  if (qty <= 0) return 'out';
  if (qty <= 5) return 'low';
  return 'ok';
}

// Margen sobre PVP en %, o null si no hay PVP. (PVP − coste) / PVP.
export function marginPct(sale: number, cost: number): number | null {
  return sale > 0 ? Math.round(((sale - cost) / sale) * 100) : null;
}

// Umbral de la vista guardada «Margen < 50%».
export const LOW_MARGIN_THRESHOLD = 50;

// Vistas guardadas (filtros rápidos de una sola selección).
export type SavedView = 'all' | 'low' | 'out' | 'lowMargin';

export interface StockMeta {
  total: number;
  rotation: Rotation;
}

// Fila lista para pintar: el producto + todo lo derivado para tabla y facetas.
export interface CatalogRow {
  product: Product;
  rootFamily: FamilyNode | null; // familia de primer nivel (la del grupo)
  stock: number;
  rotation: Rotation | null;
  state: StockState;
  margin: number | null;
}

// Grupo de la tabla: una familia raíz con sus filas y el total de unidades.
export interface CatalogGroup {
  // null = productos sin familia (grupo «Sin familia», siempre al final).
  family: FamilyNode | null;
  rows: CatalogRow[];
  totalUnits: number;
}

export interface FamilyFacet {
  family: FamilyNode;
  count: number;
}

export interface FacetCounts {
  total: number;
  views: Record<SavedView, number>;
  families: FamilyFacet[];
  states: Record<StockState, number>;
  rotations: Record<Rotation, number>;
}

export interface CatalogFilters {
  view: SavedView;
  families: ReadonlySet<string>; // ids de familia raíz; vacío = todas
  states: ReadonlySet<StockState>; // vacío = todos
  rotations: ReadonlySet<Rotation>; // vacío = todas
}

export const EMPTY_FILTERS: CatalogFilters = {
  view: 'all',
  families: new Set(),
  states: new Set(),
  rotations: new Set(),
};

const ROTATIONS: readonly Rotation[] = ['alta', 'media', 'baja'];
const STATES: readonly StockState[] = ['ok', 'low', 'out'];

// Índice familiaId → familia RAÍZ (incluye cada raíz mapeada a sí misma). Evita
// recalcular el camino por producto cuando hay muchos.
function buildRootIndex(families: FamilyNode[]): Map<string, FamilyNode> {
  const index = new Map<string, FamilyNode>();
  const walk = (node: FamilyNode, root: FamilyNode): void => {
    index.set(node.id, root);
    for (const child of node.children) walk(child, root);
  };
  for (const root of families) walk(root, root);
  return index;
}

// Enriquece cada producto con su familia raíz, stock, rotación, estado y margen.
export function buildRows(
  products: Product[],
  families: FamilyNode[],
  stock: ReadonlyMap<string, StockMeta>,
): CatalogRow[] {
  const rootIndex = buildRootIndex(families);
  // findNodePath como respaldo si el id no estuviera en el índice (árbol desincronizado).
  const rootOf = (familyId: string | null): FamilyNode | null => {
    if (!familyId) return null;
    const indexed = rootIndex.get(familyId);
    if (indexed) return indexed;
    const path = findNodePath(families, familyId);
    return path[0] ?? null;
  };

  return products.map((product) => {
    const meta = stock.get(product.id);
    // `total` viaja como string en el JSON de la API (Decimal de Prisma); coerción a
    // número para que la suma del grupo no concatene cadenas.
    const total = Number(meta?.total ?? 0);
    return {
      product,
      rootFamily: rootOf(product.familyId),
      stock: total,
      rotation: meta?.rotation ?? null,
      state: stockState(total),
      margin: marginPct(Number(product.salePrice), Number(product.costPrice)),
    };
  });
}

// Agrupa por familia raíz, en orden de familia (sortOrder · nombre); «Sin familia» al final.
export function groupRows(rows: CatalogRow[], families: FamilyNode[]): CatalogGroup[] {
  const order = new Map<string, number>();
  families.forEach((f, i) => order.set(f.id, f.sortOrder ?? i));

  const byFamily = new Map<string, CatalogRow[]>();
  const orphans: CatalogRow[] = [];
  for (const row of rows) {
    if (!row.rootFamily) {
      orphans.push(row);
      continue;
    }
    const bucket = byFamily.get(row.rootFamily.id);
    if (bucket) bucket.push(row);
    else byFamily.set(row.rootFamily.id, [row]);
  }

  const groups: CatalogGroup[] = [...byFamily.entries()].map(([, groupRowsList]) => ({
    family: groupRowsList[0]!.rootFamily,
    rows: groupRowsList,
    totalUnits: groupRowsList.reduce((sum, r) => sum + r.stock, 0),
  }));

  groups.sort((a, b) => {
    const oa = order.get(a.family!.id) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b.family!.id) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.family!.name.localeCompare(b.family!.name);
  });

  if (orphans.length) {
    groups.push({
      family: null,
      rows: orphans,
      totalUnits: orphans.reduce((sum, r) => sum + r.stock, 0),
    });
  }
  return groups;
}

// Recuentos de TODAS las facetas sobre el conjunto dado (sin aplicar selección): así
// el usuario ve siempre cuántos productos hay por familia, estado, rotación y vista.
export function computeFacets(rows: CatalogRow[], families: FamilyNode[]): FacetCounts {
  const views: Record<SavedView, number> = { all: rows.length, low: 0, out: 0, lowMargin: 0 };
  const states: Record<StockState, number> = { ok: 0, low: 0, out: 0 };
  const rotations: Record<Rotation, number> = { alta: 0, media: 0, baja: 0 };
  const familyCount = new Map<string, number>();

  for (const row of rows) {
    states[row.state] += 1;
    if (row.state === 'low') views.low += 1;
    if (row.state === 'out') views.out += 1;
    if (row.margin != null && row.margin < LOW_MARGIN_THRESHOLD) views.lowMargin += 1;
    if (row.rotation) rotations[row.rotation] += 1;
    if (row.rootFamily)
      familyCount.set(row.rootFamily.id, (familyCount.get(row.rootFamily.id) ?? 0) + 1);
  }

  const familyFacets: FamilyFacet[] = families
    .map((family) => ({ family, count: familyCount.get(family.id) ?? 0 }))
    .filter((f) => f.count > 0);

  return { total: rows.length, views, families: familyFacets, states, rotations };
}

// Aplica las facetas seleccionadas. Entre categorías = AND; dentro de una = OR.
export function applyFilters(rows: CatalogRow[], filters: CatalogFilters): CatalogRow[] {
  return rows.filter((row) => {
    switch (filters.view) {
      case 'low':
        if (row.state !== 'low') return false;
        break;
      case 'out':
        if (row.state !== 'out') return false;
        break;
      case 'lowMargin':
        if (row.margin == null || row.margin >= LOW_MARGIN_THRESHOLD) return false;
        break;
      case 'all':
        break;
    }
    if (filters.families.size && !(row.rootFamily && filters.families.has(row.rootFamily.id)))
      return false;
    if (filters.states.size && !filters.states.has(row.state)) return false;
    if (filters.rotations.size && !(row.rotation && filters.rotations.has(row.rotation)))
      return false;
    return true;
  });
}

// ¿Hay alguna faceta activa? (para el botón «limpiar» y el estado vacío).
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.view !== 'all' ||
    filters.families.size > 0 ||
    filters.states.size > 0 ||
    filters.rotations.size > 0
  );
}

export const ALL_STATES = STATES;
export const ALL_ROTATIONS = ROTATIONS;
