import { describe, expect, it } from 'vitest';

import {
  asFormat,
  asRecipe,
  clampInt,
  clampRecipe,
  inferFormat,
  recipeChartColumns,
  slotForPiece,
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
});
