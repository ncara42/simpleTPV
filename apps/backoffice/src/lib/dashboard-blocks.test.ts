import { describe, expect, it } from 'vitest';

import { BLOCK_CATALOG, BLOCK_IDS, buildBlockSpec } from './dashboard-blocks.js';
import { PIECE_ALLOWLIST, RECIPE_ALLOWLIST } from './dashboard-pieces.js';

describe('dashboard-blocks — bloques pre-cableados (#205)', () => {
  it('el catálogo expone 7 bloques con prefijo block: y tamaño', () => {
    expect(BLOCK_IDS).toEqual([
      'block:sales-overview',
      'block:stock-risk',
      'block:staff-performance',
      'block:product-ranking',
      'block:top-margin',
      'block:dead-stock',
      'block:store-comparison',
    ]);
    for (const id of BLOCK_IDS) {
      expect(BLOCK_CATALOG[id]?.label).toBeTruthy();
      expect(BLOCK_CATALOG[id]?.defaultSize.w).toBeGreaterThan(0);
    }
  });

  it('los rankings por dimensión pasan rankBy y leen el campo value uniforme (#225)', () => {
    const cases: Array<[string, string, string]> = [
      ['block:product-ranking', 'sales', 'eur'],
      ['block:top-margin', 'margin', 'eur'],
      ['block:dead-stock', 'rotation', 'integer'],
    ];
    for (const [id, rankBy, format] of cases) {
      const leaf = buildBlockSpec(id, {})?.slots?.charts?.[0];
      expect(leaf?.endpoint).toBe('/dashboard/product-rankings');
      expect(leaf?.params).toEqual({ rankBy });
      expect(leaf?.valueField).toBe('value');
      expect(leaf?.format).toBe(format);
    }
  });

  it('buildBlockSpec(sales-overview) construye un panel v2 con KPIs + tendencia', () => {
    const spec = buildBlockSpec('block:sales-overview', {});
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe('panel');
    expect(spec!.type).toBe('composite');
    expect(spec!.recipe).toBe('kpiRow+oneChart');
    expect(spec!.slots?.kpis).toHaveLength(3);
    expect(spec!.slots?.kpis?.map((p) => p.valueField)).toEqual(['revenue', 'avgTicket', 'upt']);
    expect(spec!.slots?.charts?.[0]?.piece).toBe('trendArea');
    expect(spec!.slots?.charts?.[0]?.endpoint).toBe('/dashboard/sales-by-hour');
  });

  it('hereda params (period/storeId) en TODAS las hojas', () => {
    const spec = buildBlockSpec('block:sales-overview', { period: 'month', storeId: 'S1' });
    const allLeaves = [...(spec!.slots?.kpis ?? []), ...(spec!.slots?.charts ?? [])];
    expect(allLeaves.length).toBeGreaterThan(0);
    for (const leaf of allLeaves) {
      expect(leaf.period).toBe('month');
      expect(leaf.storeId).toBe('S1');
    }
  });

  it('todos los bloques usan recetas y piezas de la allowlist + endpoints no vacíos', () => {
    for (const id of BLOCK_IDS) {
      const spec = buildBlockSpec(id, {});
      expect(spec).not.toBeNull();
      expect((RECIPE_ALLOWLIST as readonly string[]).includes(spec!.recipe!)).toBe(true);
      const leaves = [...(spec!.slots?.kpis ?? []), ...(spec!.slots?.charts ?? [])];
      expect(leaves.length).toBeGreaterThan(0);
      for (const leaf of leaves) {
        expect(PIECE_ALLOWLIST.has(leaf.piece)).toBe(true);
        expect(leaf.endpoint).toBeTruthy();
      }
    }
  });

  it('store-comparison cablea facturación + margen por tienda (#224)', () => {
    const charts = buildBlockSpec('block:store-comparison', { period: 'week' })?.slots?.charts;
    expect(charts).toHaveLength(2);
    for (const leaf of charts!) {
      expect(leaf.endpoint).toBe('/dashboard/sales-by-store');
      expect(leaf.labelField).toBe('storeName');
      expect(leaf.period).toBe('week');
    }
    expect(charts![0]!.valueField).toBe('revenue');
    expect(charts![1]!.valueField).toBe('margin');
  });

  it('acepta el id con o sin prefijo block:', () => {
    expect(buildBlockSpec('block:stock-risk', {})?.title).toBe('Riesgo de stock');
    expect(buildBlockSpec('stock-risk', {})?.title).toBe('Riesgo de stock');
  });

  it('bloque desconocido → null', () => {
    expect(buildBlockSpec('block:no-existe', {})).toBeNull();
    expect(buildBlockSpec('block:', {})).toBeNull();
  });
});
