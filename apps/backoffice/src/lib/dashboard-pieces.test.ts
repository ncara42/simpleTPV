import { describe, expect, it } from 'vitest';

// Contrato compartido TS↔Rust (#206). Import directo (resolveJsonModule); la raíz pnpm permite
// leer fuera de apps/backoffice. El test gemelo en Rust verifica el otro lado contra el mismo JSON.
import contract from '../../../../docs/contracts/dataviz-contract.json';
import { BLOCK_IDS } from './dashboard-blocks.js';
import {
  asFormat,
  asRecipe,
  clampInt,
  clampRecipe,
  inferFormat,
  PIECE_ALLOWLIST,
  PIECE_FORMATS,
  RECIPE_ALLOWLIST,
  recipeChartColumns,
  slotForPiece,
  WIDGETABLE_ENDPOINTS,
} from './dashboard-pieces.js';

describe('dashboard-pieces — reparadores del DSL v2 (#204)', () => {
  describe('inferFormat', () => {
    it('importes → eur', () => {
      expect(inferFormat('revenue')).toBe('eur');
      expect(inferFormat('total')).toBe('eur');
      expect(inferFormat('avgTicket')).toBe('eur');
    });
    it('tasas/porcentajes → percent', () => {
      expect(inferFormat('discountRate')).toBe('percent');
      expect(inferFormat('marginPct')).toBe('percent');
    });
    it('upt → decimal; unidades → units', () => {
      expect(inferFormat('upt')).toBe('decimal');
      expect(inferFormat('units')).toBe('units');
      expect(inferFormat('quantity')).toBe('units');
    });
    it('vecinos de conteo/ratio NO salen eur (la keyword eur es substring no anclado)', () => {
      // El bug original: `ticketCount`/`salesUnits` → eur. El conteo/ratio gana al substring eur.
      expect(inferFormat('ticketCount')).toBe('units');
      expect(inferFormat('salesUnits')).toBe('units');
      expect(inferFormat('totalUnits')).toBe('units');
      expect(inferFormat('priceRatio')).toBe('percent');
      expect(inferFormat('avgUnitsPerTicket')).toBe('decimal');
    });
    it('campo desconocido o ausente → undefined', () => {
      expect(inferFormat('foo')).toBeUndefined();
      expect(inferFormat(undefined)).toBeUndefined();
    });
  });

  describe('clampRecipe', () => {
    it('una receta válida se respeta', () => {
      expect(
        clampRecipe('kpiRow+twoCharts', { kpis: 1, charts: 2, firstChartIsTable: false }),
      ).toBe('kpiRow+twoCharts');
    });
    it('sin charts → kpiRow', () => {
      expect(clampRecipe('xxx', { kpis: 3, charts: 0, firstChartIsTable: false })).toBe('kpiRow');
    });
    it('≥2 charts → kpiRow+twoCharts', () => {
      expect(clampRecipe('xxx', { kpis: 0, charts: 3, firstChartIsTable: false })).toBe(
        'kpiRow+twoCharts',
      );
    });
    it('1 chart con kpis → kpiRow+oneChart; sin kpis y tabla → tableFull', () => {
      expect(clampRecipe('xxx', { kpis: 2, charts: 1, firstChartIsTable: false })).toBe(
        'kpiRow+oneChart',
      );
      expect(clampRecipe('xxx', { kpis: 0, charts: 1, firstChartIsTable: true })).toBe('tableFull');
      expect(clampRecipe('xxx', { kpis: 0, charts: 1, firstChartIsTable: false })).toBe(
        'heroChart+sideStats',
      );
    });
  });

  describe('slotForPiece', () => {
    it('kpiTile → kpis; gráficas → charts', () => {
      expect(slotForPiece('kpiTile')).toBe('kpis');
      expect(slotForPiece('comparisonBars')).toBe('charts');
      expect(slotForPiece('dataGrid')).toBe('charts');
    });
  });

  describe('clampInt / asFormat / asRecipe / recipeChartColumns', () => {
    it('clampInt acota al rango y rechaza no-números', () => {
      expect(clampInt(99, 1, 8)).toBe(8);
      expect(clampInt(0, 1, 8)).toBe(1);
      expect(clampInt('5', 1, 8)).toBe(5);
      expect(clampInt('x', 1, 8)).toBeUndefined();
    });
    it('asFormat / asRecipe validan contra la allowlist', () => {
      expect(asFormat('eur')).toBe('eur');
      expect(asFormat('nope')).toBeNull();
      expect(asRecipe('tableFull')).toBe('tableFull');
      expect(asRecipe('nope')).toBeNull();
    });
    it('recipeChartColumns = 2 solo para kpiRow+twoCharts', () => {
      expect(recipeChartColumns('kpiRow+twoCharts')).toBe(2);
      expect(recipeChartColumns('kpiRow+oneChart')).toBe(1);
      expect(recipeChartColumns('tableFull')).toBe(1);
    });
  });

  // PARIDAD TS↔Rust (#206 F5): el frontend y el backend (crates/ai/tools.rs, crates/domain/context.rs)
  // deben coincidir en piezas/recetas/formatos/endpoints/bloques. La fuente de verdad es el contrato
  // docs/contracts/dataviz-contract.json; un test gemelo en Rust verifica el otro lado.
  describe('paridad con el contrato compartido', () => {
    it('PIECE_ALLOWLIST coincide con el contrato', () => {
      expect([...PIECE_ALLOWLIST].sort()).toEqual([...contract.pieces].sort());
    });
    it('RECIPE_ALLOWLIST coincide con el contrato', () => {
      expect([...RECIPE_ALLOWLIST]).toEqual(contract.recipes);
    });
    it('PIECE_FORMATS coincide con el contrato', () => {
      expect([...PIECE_FORMATS]).toEqual(contract.formats);
    });
    it('WIDGETABLE_ENDPOINTS coincide con el contrato', () => {
      expect([...WIDGETABLE_ENDPOINTS].sort()).toEqual([...contract.endpoints].sort());
    });
    it('los bloques coinciden con el contrato', () => {
      const ids = BLOCK_IDS.map((id) => id.replace(/^block:/, ''));
      expect([...ids].sort()).toEqual([...contract.blocks].sort());
    });
  });
});
