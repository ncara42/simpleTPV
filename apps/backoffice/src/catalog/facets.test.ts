import type { Rotation } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import type { FamilyNode } from '../lib/families.js';
import type { Product } from '../lib/products.js';
import {
  applyFilters,
  buildRows,
  computeFacets,
  EMPTY_FILTERS,
  groupRows,
  marginPct,
  type StockMeta,
  stockState,
} from './facets.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────
function family(id: string, name: string, partial: Partial<FamilyNode> = {}): FamilyNode {
  return {
    id,
    parentId: null,
    name,
    color: null,
    icon: null,
    sortOrder: 0,
    isArchetype: false,
    children: [],
    ...partial,
  };
}

function product(id: string, familyId: string | null, partial: Partial<Product> = {}): Product {
  return {
    id,
    name: `Producto ${id}`,
    sku: null,
    barcode: null,
    description: null,
    salePrice: '10',
    costPrice: '4',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'u',
    familyId,
    active: true,
    ...partial,
  };
}

const aceitesCbd = family('f-aceites-cbd', 'Aceites CBD', { parentId: 'f-aceites' });
const aceites = family('f-aceites', 'Aceites', {
  sortOrder: 1,
  color: '#FFC107',
  children: [aceitesCbd],
});
const flores = family('f-flores', 'Flores CBD', { sortOrder: 2, color: '#4CAF50' });
const families: FamilyNode[] = [aceites, flores];

const products: Product[] = [
  product('p1', 'f-aceites-cbd'), // cuelga de subfamilia → raíz Aceites
  product('p2', 'f-aceites'), // raíz Aceites directa
  product('p3', 'f-flores'),
  product('p4', null), // sin familia
];

// `total` llega como STRING desde la API (Decimal de Prisma) — clave para el bug de la
// suma de unidades por grupo. Lo forzamos a string con un cast para ejercer la coerción.
const stock = new Map<string, StockMeta>([
  ['p1', { total: '10' as unknown as number, rotation: 'alta' }],
  ['p2', { total: '3' as unknown as number, rotation: 'media' }],
  ['p3', { total: '0' as unknown as number, rotation: 'baja' }],
  ['p4', { total: '7' as unknown as number, rotation: 'alta' }],
]);

describe('stockState', () => {
  it('clasifica por umbral: 0 = out, ≤5 = low, >5 = ok', () => {
    expect(stockState(0)).toBe('out');
    expect(stockState(4)).toBe('low');
    expect(stockState(5)).toBe('low');
    expect(stockState(6)).toBe('ok');
  });
});

describe('marginPct', () => {
  it('calcula el margen sobre PVP y null sin PVP', () => {
    expect(marginPct(10, 4)).toBe(60);
    expect(marginPct(0, 0)).toBeNull();
  });
});

describe('buildRows', () => {
  const rows = buildRows(products, families, stock);

  it('coerciona el stock string a número (sin concatenar)', () => {
    expect(rows.find((r) => r.product.id === 'p1')!.stock).toBe(10);
    expect(typeof rows[0]!.stock).toBe('number');
  });

  it('resuelve la familia RAÍZ a través de subfamilias', () => {
    expect(rows.find((r) => r.product.id === 'p1')!.rootFamily?.id).toBe('f-aceites');
    expect(rows.find((r) => r.product.id === 'p4')!.rootFamily).toBeNull();
  });

  it('deriva estado y rotación', () => {
    expect(rows.find((r) => r.product.id === 'p2')!.state).toBe('low');
    expect(rows.find((r) => r.product.id === 'p3')!.state).toBe('out');
    expect(rows.find((r) => r.product.id === 'p2')!.rotation).toBe('media');
  });
});

describe('groupRows', () => {
  const groups = groupRows(buildRows(products, families, stock), families);

  it('agrupa por familia raíz en orden de sortOrder, con «Sin familia» al final', () => {
    expect(groups.map((g) => g.family?.name ?? 'Sin familia')).toEqual([
      'Aceites',
      'Flores CBD',
      'Sin familia',
    ]);
  });

  it('suma las unidades del grupo como número', () => {
    expect(groups[0]!.totalUnits).toBe(13); // 10 + 3, no "0103"
    expect(groups[2]!.totalUnits).toBe(7);
  });
});

describe('computeFacets', () => {
  const facets = computeFacets(buildRows(products, families, stock), families);

  it('cuenta vistas, familias, estados y rotaciones', () => {
    expect(facets.total).toBe(4);
    expect(facets.views.out).toBe(1);
    expect(facets.views.low).toBe(1);
    expect(facets.families.map((f) => [f.family.name, f.count])).toEqual([
      ['Aceites', 2],
      ['Flores CBD', 1],
    ]);
    expect(facets.states).toEqual({ ok: 2, low: 1, out: 1 });
    expect(facets.rotations).toEqual({ alta: 2, media: 1, baja: 1 });
  });
});

describe('applyFilters', () => {
  const rows = buildRows(products, families, stock);
  const ids = (rs: ReturnType<typeof buildRows>): string[] => rs.map((r) => r.product.id);

  it('sin filtros devuelve todo', () => {
    expect(ids(applyFilters(rows, EMPTY_FILTERS))).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('vista «sin stock» (out)', () => {
    expect(ids(applyFilters(rows, { ...EMPTY_FILTERS, view: 'out' }))).toEqual(['p3']);
  });

  it('familia (subárbol vía raíz)', () => {
    expect(ids(applyFilters(rows, { ...EMPTY_FILTERS, families: new Set(['f-aceites']) }))).toEqual(
      ['p1', 'p2'],
    );
  });

  it('rotación', () => {
    const rotations: ReadonlySet<Rotation> = new Set<Rotation>(['alta']);
    expect(ids(applyFilters(rows, { ...EMPTY_FILTERS, rotations }))).toEqual(['p1', 'p4']);
  });

  it('combina categorías con AND', () => {
    expect(
      ids(
        applyFilters(rows, {
          ...EMPTY_FILTERS,
          families: new Set(['f-aceites']),
          states: new Set(['low']),
        }),
      ),
    ).toEqual(['p2']);
  });
});
