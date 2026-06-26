import type { StockGlobalRow } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import type { FamilyNode } from '../lib/families.js';
import type { Product } from '../lib/products.js';
import {
  applyFamilyRotation,
  applyView,
  buildExRows,
  computeExFacets,
  EMPTY_EX_FILTERS,
  type ExFilters,
  familyColorVar,
  groupExRows,
  levelOf,
  scopeOf,
  searchRows,
} from './existences.js';

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

type StoreStock = { storeId: string; quantity: number; minStock: number };
function stockRow(
  productId: string,
  productName: string,
  rotation: StockGlobalRow['rotation'],
  stores: StoreStock[],
): StockGlobalRow {
  return {
    productId,
    productName,
    total: stores.reduce((a, s) => a + s.quantity, 0),
    rotation,
    stores: stores.map((s) => ({
      storeId: s.storeId,
      storeName: s.storeId === 's1' ? 'Centro' : 'Norte',
      quantity: s.quantity,
      minStock: s.minStock,
      level: 'green',
    })),
  };
}

const aceitesCbd = family('f-aceites-cbd', 'Aceites CBD', { parentId: 'f-aceites' });
const aceites = family('f-aceites', 'Aceites', { sortOrder: 1, children: [aceitesCbd] });
const flores = family('f-flores', 'Flores CBD', { sortOrder: 2 });
const families: FamilyNode[] = [aceites, flores];

const products: Product[] = [
  product('p1', 'f-aceites-cbd'), // cuelga de subfamilia → raíz Aceites
  product('p2', 'f-flores'),
  product('p3', null), // sin familia
];

const stockRows: StockGlobalRow[] = [
  stockRow('p1', 'Aceite CBD 10%', 'media', [
    { storeId: 's1', quantity: 10, minStock: 5 },
    { storeId: 's2', quantity: 2, minStock: 4 },
  ]),
  stockRow('p2', 'Flor Lemon Haze', 'alta', [{ storeId: 's1', quantity: 0, minStock: 3 }]),
  stockRow('p3', 'Grinder metálico', 'baja', [{ storeId: 's1', quantity: 8, minStock: 2 }]),
];

const rows = buildExRows(stockRows, products, families);
const rowById = (id: string) => rows.find((r) => r.productId === id)!;

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('levelOf', () => {
  it('agotado cuando la cantidad es 0 o menos', () => {
    expect(levelOf(0, 5)).toBe('out');
    expect(levelOf(-1, 5)).toBe('out');
  });
  it('bajo cuando la cantidad es ≤ mínimo (pero > 0)', () => {
    expect(levelOf(3, 5)).toBe('low');
    expect(levelOf(5, 5)).toBe('low');
  });
  it('sano cuando la cantidad supera el mínimo', () => {
    expect(levelOf(6, 5)).toBe('ok');
  });
});

describe('buildExRows', () => {
  it('resuelve la familia raíz desde una subfamilia', () => {
    expect(rowById('p1').rootFamily?.id).toBe('f-aceites');
  });
  it('deja sin familia raíz a los productos sin familia', () => {
    expect(rowById('p3').rootFamily).toBeNull();
  });
  it('toma el nombre y la rotación del stock global', () => {
    expect(rowById('p1').name).toBe('Aceite CBD 10%');
    expect(rowById('p1').rotation).toBe('media');
  });
  it('coacciona cantidad/mínimo a número', () => {
    const r = buildExRows(
      [
        {
          productId: 'p9',
          productName: 'X',
          total: 0,
          rotation: 'media',
          stores: [
            {
              storeId: 's1',
              storeName: 'Centro',
              quantity: '7' as unknown as number,
              minStock: '2' as unknown as number,
              level: 'green',
            },
          ],
        },
      ],
      [],
      families,
    );
    expect(r[0]!.stores[0]!.quantity).toBe(7);
    expect(typeof r[0]!.stores[0]!.quantity).toBe('number');
  });
});

describe('scopeOf', () => {
  it('ámbito vacío = todas: suma cantidades y mínimos y calcula el nivel sobre la suma', () => {
    expect(scopeOf(rowById('p1'), new Set())).toEqual({ disp: 12, min: 9, level: 'ok' });
  });
  it('una tienda concreta toma su par cantidad/mínimo', () => {
    expect(scopeOf(rowById('p1'), new Set(['s2']))).toEqual({ disp: 2, min: 4, level: 'low' });
  });
  it('varias tiendas suman solo las seleccionadas', () => {
    expect(scopeOf(rowById('p1'), new Set(['s1', 's2']))).toEqual({
      disp: 12,
      min: 9,
      level: 'ok',
    });
  });
  it('producto ausente en la tienda → 0/0 agotado', () => {
    expect(scopeOf(rowById('p2'), new Set(['s2']))).toEqual({ disp: 0, min: 0, level: 'out' });
  });
});

describe('searchRows', () => {
  it('filtra por nombre ignorando mayúsculas y tildes', () => {
    expect(searchRows(rows, 'aceite').map((r) => r.productId)).toEqual(['p1']);
    expect(searchRows(rows, 'LÉMON').map((r) => r.productId)).toEqual(['p2']);
  });
  it('cadena vacía devuelve todo', () => {
    expect(searchRows(rows, '  ')).toHaveLength(3);
  });
});

describe('applyFamilyRotation', () => {
  it('filtra por familia raíz seleccionada', () => {
    const f: ExFilters = { ...EMPTY_EX_FILTERS, families: new Set(['f-aceites']) };
    expect(applyFamilyRotation(rows, f).map((r) => r.productId)).toEqual(['p1']);
  });
  it('filtra por rotación', () => {
    const f: ExFilters = { ...EMPTY_EX_FILTERS, rotations: new Set(['alta']) };
    expect(applyFamilyRotation(rows, f).map((r) => r.productId)).toEqual(['p2']);
  });
  it('sin selección devuelve todo', () => {
    expect(applyFamilyRotation(rows, EMPTY_EX_FILTERS)).toHaveLength(3);
  });
});

describe('applyView', () => {
  it('vista «sin stock» según el ámbito «todas»', () => {
    expect(applyView(rows, 'out', new Set()).map((r) => r.productId)).toEqual(['p2']);
  });
  it('vista «bajo mínimo» depende del ámbito (tienda Norte)', () => {
    expect(applyView(rows, 'low', new Set(['s2'])).map((r) => r.productId)).toEqual(['p1']);
  });
  it('vista «todo» no filtra', () => {
    expect(applyView(rows, 'all', new Set())).toHaveLength(3);
  });
});

describe('computeExFacets', () => {
  it('cuenta vistas sobre el conjunto tras familia/rotación y con el ámbito', () => {
    const facets = computeExFacets(rows, rows, families, new Set());
    expect(facets.views.all).toBe(3);
    expect(facets.views.out).toBe(1); // p2
    expect(facets.views.low).toBe(0); // en «todas», p1 suma 12>9
  });
  it('cuenta familias sobre lo buscado (solo con productos)', () => {
    const facets = computeExFacets(rows, rows, families, new Set());
    expect(facets.families.map((f) => [f.family.id, f.count])).toEqual([
      ['f-aceites', 1],
      ['f-flores', 1],
    ]);
  });
  it('cuenta rotaciones', () => {
    const facets = computeExFacets(rows, rows, families, new Set());
    expect(facets.rotations).toEqual({ alta: 1, media: 1, baja: 1 });
  });
});

describe('groupExRows', () => {
  it('agrupa por familia raíz en orden, con «sin familia» al final', () => {
    const groups = groupExRows(rows, families, new Set());
    expect(groups.map((g) => g.family?.name ?? 'Sin familia')).toEqual([
      'Aceites',
      'Flores CBD',
      'Sin familia',
    ]);
  });
  it('suma las unidades del grupo en el ámbito activo', () => {
    const groups = groupExRows(rows, families, new Set());
    expect(groups[0]!.totalUnits).toBe(12); // p1 en todas las tiendas
    const norte = groupExRows(rows, families, new Set(['s2']));
    expect(norte[0]!.totalUnits).toBe(2); // p1 solo en Norte
  });
});

describe('familyColorVar', () => {
  it('devuelve un token --fam-c-N estable', () => {
    expect(familyColorVar('f-aceites')).toMatch(/^var\(--fam-c-[0-7]\)$/);
    expect(familyColorVar('f-aceites')).toBe(familyColorVar('f-aceites'));
  });
});
