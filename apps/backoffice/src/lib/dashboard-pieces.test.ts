import { describe, expect, it } from 'vitest';

// Contrato compartido TS↔Rust (#206). Import directo (resolveJsonModule); la raíz pnpm permite
// leer fuera de apps/backoffice. El test gemelo en Rust verifica el otro lado contra el mismo JSON.
import contract from '../../../../docs/contracts/dataviz-contract.json';
import { BLOCK_IDS } from './dashboard-blocks.js';
import type { GenericSpec } from './dashboard-layout.js';
import {
  asFormat,
  asRecipe,
  clampInt,
  clampRecipe,
  decomposePanelSpec,
  inferFormat,
  PIECE_ALLOWLIST,
  PIECE_FORMATS,
  RECIPE_ALLOWLIST,
  recipeChartColumns,
  slotForPiece,
  WIDGETABLE_ENDPOINTS,
} from './dashboard-pieces.js';

describe('decomposePanelSpec', () => {
  const panel: GenericSpec = {
    type: 'composite',
    kind: 'panel',
    version: 2,
    endpoint: '',
    title: 'Resumen de ventas',
    defaultSize: { w: 8, h: 5 },
    recipe: 'kpiRow+oneChart',
    density: 'comfortable',
    slots: {
      kpis: [
        {
          piece: 'kpiTile',
          title: 'Facturación',
          endpoint: '/dashboard/sales-kpis',
          valueField: 'revenue',
        },
        {
          piece: 'kpiTile',
          title: 'Ticket medio',
          endpoint: '/dashboard/sales-kpis',
          valueField: 'avgTicket',
        },
      ],
      charts: [
        {
          piece: 'trendArea',
          title: 'Ventas por hora',
          endpoint: '/dashboard/sales-by-hour',
          labelField: 'hour',
          valueField: 'revenue',
        },
      ],
    },
  };

  it('separa un panel multi-pieza en N widgets de UNA pieza, conservando el binding de cada uno', () => {
    const parts = decomposePanelSpec(panel);
    expect(parts).toHaveLength(3); // 2 KPIs + 1 gráfica
    // Cada parte es un panel de una sola pieza.
    for (const p of parts) {
      const pieceCount = (p.slots?.kpis?.length ?? 0) + (p.slots?.charts?.length ?? 0);
      expect(pieceCount).toBe(1);
      expect(p.kind).toBe('panel');
    }
    // KPI → kpiRow estrecho; gráfica → tableFull (una pieza a lo ancho).
    const kpi = parts.find((p) => p.slots?.kpis)!;
    expect(kpi.recipe).toBe('kpiRow');
    expect(kpi.title).toBe('Facturación');
    expect(kpi.slots?.kpis?.[0]?.valueField).toBe('revenue');
    const chart = parts.find((p) => p.slots?.charts)!;
    expect(chart.recipe).toBe('tableFull');
    expect(chart.slots?.charts?.[0]?.piece).toBe('trendArea');
  });

  it('no toca un panel de una sola pieza ni un genérico que no sea panel', () => {
    const single: GenericSpec = { ...panel, slots: { kpis: [panel.slots!.kpis![0]!] } };
    expect(decomposePanelSpec(single)).toEqual([single]);
    const kpi: GenericSpec = {
      type: 'kpi',
      endpoint: '/x',
      title: 'K',
      defaultSize: { w: 2, h: 1 },
    };
    expect(decomposePanelSpec(kpi)).toEqual([kpi]);
  });
});

describe('dashboard-pieces — reparadores del DSL v2 (#204)', () => {
  describe('inferFormat', () => {
    it('importes → eur', () => {
      expect(inferFormat('revenue')).toBe('eur');
      expect(inferFormat('total')).toBe('eur');
      expect(inferFormat('avgTicket')).toBe('eur');
    });
    it('tasas/porcentajes (fracción 0..1) → percentRatio', () => {
      expect(inferFormat('discountRate')).toBe('percentRatio');
      expect(inferFormat('returnRate')).toBe('percentRatio');
      expect(inferFormat('avgDiscountPct')).toBe('percentRatio');
      expect(inferFormat('marginPct')).toBe('percentRatio');
      expect(inferFormat('rate')).toBe('percentRatio');
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
      expect(inferFormat('priceRatio')).toBe('percentRatio');
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
    it('una receta válida pero contradictoria con el nº de piezas se re-deriva (#212)', () => {
      // kpiRow (0 charts) pedida con 4 charts → no encaja → kpiRow+twoCharts.
      expect(clampRecipe('kpiRow', { kpis: 1, charts: 4, firstChartIsTable: false })).toBe(
        'kpiRow+twoCharts',
      );
      // kpiRow+twoCharts (≥2) pedida con 1 chart + kpis → kpiRow+oneChart.
      expect(
        clampRecipe('kpiRow+twoCharts', { kpis: 2, charts: 1, firstChartIsTable: false }),
      ).toBe('kpiRow+oneChart');
      // heroChart+sideStats (1 chart) pedida sin charts → kpiRow.
      expect(
        clampRecipe('heroChart+sideStats', { kpis: 3, charts: 0, firstChartIsTable: false }),
      ).toBe('kpiRow');
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
