import type { ReactNode } from 'react';

import { BLOCK_IDS, buildBlockSpec } from '../lib/dashboard-blocks.js';
import type { GenericSpec, PieceSpec, RecipeId } from '../lib/dashboard-layout.js';
import { GenericPanel } from '../widgets/generic/GenericPanel.js';

// Harness de regresión visual (#211): renderiza cada RECETA v2 y cada BLOQUE pre-cableado en frames
// de ancho fijo con un `data-vis` estable, para que Playwright los capture por breakpoint
// (320/768/1024/1440) con datos mock (stub de red en el spec). NO se monta en la app real: es un
// entry de Vite aparte (visual.html) servido solo en build/preview.

// Construye un GenericSpec de panel para una receta concreta con piezas representativas. Los
// endpoints apuntan a la allowlist real (el spec de Playwright los stubea con datos deterministas).
function recipeSpec(recipe: RecipeId, kpis: PieceSpec[], charts: PieceSpec[]): GenericSpec {
  return {
    type: 'composite',
    kind: 'panel',
    version: 2,
    endpoint: '',
    title: recipe,
    defaultSize: { w: 8, h: 5 },
    recipe,
    density: 'comfortable',
    slots: {
      ...(kpis.length ? { kpis } : {}),
      ...(charts.length ? { charts } : {}),
    },
  };
}

const KPI_REVENUE: PieceSpec = {
  piece: 'kpiTile',
  title: 'Facturación',
  endpoint: '/dashboard/sales-kpis',
  valueField: 'revenue',
  format: 'eur',
};
const KPI_TICKET: PieceSpec = {
  piece: 'kpiTile',
  title: 'Ticket medio',
  endpoint: '/dashboard/sales-kpis',
  valueField: 'avgTicket',
  format: 'eur',
};
const KPI_MARGIN: PieceSpec = {
  piece: 'kpiTile',
  title: '% margen',
  endpoint: '/dashboard/margin-kpis',
  valueField: 'marginPct',
  format: 'percentRatio',
};
const BARS_EMPLOYEE: PieceSpec = {
  piece: 'comparisonBars',
  title: 'Ventas por vendedor',
  endpoint: '/dashboard/sales-by-employee',
  labelField: 'userName',
  valueField: 'total',
  format: 'eur',
};
const AREA_HOUR: PieceSpec = {
  piece: 'trendArea',
  title: 'Ventas por hora',
  endpoint: '/dashboard/sales-by-hour',
  labelField: 'hour',
  valueField: 'revenue',
  format: 'eur',
};
const TABLE_PRODUCTS: PieceSpec = {
  piece: 'dataGrid',
  title: 'Productos',
  endpoint: '/products',
  columns: [
    { field: 'name', label: 'Producto' },
    { field: 'price', label: 'Precio', format: 'eur', align: 'right' },
  ],
};

// Una receta de cada tipo (el verificable de #211 lista las 5).
const RECIPES: ReadonlyArray<{ id: string; spec: GenericSpec }> = [
  { id: 'recipe-kpiRow', spec: recipeSpec('kpiRow', [KPI_REVENUE, KPI_TICKET, KPI_MARGIN], []) },
  {
    id: 'recipe-kpiRow-oneChart',
    spec: recipeSpec('kpiRow+oneChart', [KPI_REVENUE, KPI_TICKET], [BARS_EMPLOYEE]),
  },
  {
    id: 'recipe-kpiRow-twoCharts',
    spec: recipeSpec('kpiRow+twoCharts', [KPI_REVENUE, KPI_TICKET], [BARS_EMPLOYEE, AREA_HOUR]),
  },
  {
    id: 'recipe-heroChart-sideStats',
    spec: recipeSpec('heroChart+sideStats', [KPI_REVENUE, KPI_MARGIN], [AREA_HOUR]),
  },
  { id: 'recipe-tableFull', spec: recipeSpec('tableFull', [], [TABLE_PRODUCTS]) },
];

const BLOCKS: ReadonlyArray<{ id: string; spec: GenericSpec }> = BLOCK_IDS.map((blockId) => {
  const spec = buildBlockSpec(blockId, { period: 'month' });
  return { id: `block-${blockId.replace(/^block:/, '')}`, spec: spec as GenericSpec };
}).filter((b) => b.spec);

function Frame({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="vis-frame" data-vis={id}>
      {children}
    </div>
  );
}

// Renderiza todas las recetas + bloques. El spec controla el estado (loaded/empty/error/loading)
// vía stub de red, así que el harness es agnóstico al estado.
export function VisualHarness() {
  return (
    <div className="vis-root">
      {RECIPES.map(({ id, spec }) => (
        <Frame key={id} id={id}>
          <GenericPanel spec={spec} />
        </Frame>
      ))}
      {BLOCKS.map(({ id, spec }) => (
        <Frame key={id} id={id}>
          <GenericPanel spec={spec} />
        </Frame>
      ))}
    </div>
  );
}
