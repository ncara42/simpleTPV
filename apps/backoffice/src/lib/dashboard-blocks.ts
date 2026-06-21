// Bloques pre-cableados del dashboard (#205, EPIC #201): paneles v2 COMPLETOS que el agente coloca
// con UNA sola llamada `add_widget widget_id='block:<id>'` (sin construir slots). Cada bloque es una
// receta + slots fijos cableados a endpoints concretos (campos verificados contra los DTO del
// backend). Reduce el whack-a-mole al máximo: cero árbol, cero geometría, diseño probado.
//
// Los bloques son CONFIABLES (los autoramos nosotros), así que NO pasan por normalizePanelSpec: ya
// son un GenericSpec panel válido. `params` (period/storeId) se hereda por todas las hojas.

import type { GenericSpec, PieceSpec, RecipeId, SlotName } from './dashboard-layout.js';
import { RECIPE_SIZE } from './dashboard-pieces.js';

export interface BlockParams {
  period?: string;
  storeId?: string | null;
}

// Aplica los params del bloque (period/storeId) a una hoja-pieza (herencia a todas las hojas).
function withParams(piece: PieceSpec, p: BlockParams): PieceSpec {
  return {
    ...piece,
    ...(p.period ? { period: p.period as NonNullable<PieceSpec['period']> } : {}),
    ...(p.storeId != null ? { storeId: p.storeId } : {}),
  };
}

interface BlockDef {
  label: string;
  recipe: RecipeId;
  build: (p: BlockParams) => Partial<Record<SlotName, PieceSpec[]>>;
}

const BLOCKS: Record<string, BlockDef> = {
  // Resumen de ventas: 3 KPIs (facturación/ticket medio/uds. por ticket) + tendencia por hora.
  'sales-overview': {
    label: 'Resumen de ventas',
    recipe: 'kpiRow+oneChart',
    build: (p) => ({
      kpis: [
        withParams(
          {
            piece: 'kpiTile',
            title: 'Facturación',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Ticket medio',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'avgTicket',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Uds. por ticket',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'upt',
            format: 'decimal',
          },
          p,
        ),
      ],
      charts: [
        withParams(
          {
            piece: 'trendArea',
            title: 'Ventas por hora',
            endpoint: '/dashboard/sales-by-hour',
            labelField: 'hour',
            valueField: 'revenue',
            format: 'eur',
          },
          p,
        ),
      ],
    }),
  },

  // Riesgo de stock: KPIs de venta perdida + roturas abiertas, y tablas de alertas y caducidades.
  'stock-risk': {
    label: 'Riesgo de stock',
    recipe: 'kpiRow+twoCharts',
    build: (p) => ({
      kpis: [
        withParams(
          {
            piece: 'kpiTile',
            title: 'Venta perdida est.',
            endpoint: '/dashboard/stockout-kpis',
            valueField: 'estimatedLostSales',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Roturas abiertas',
            endpoint: '/dashboard/stockout-kpis',
            valueField: 'open',
            format: 'integer',
          },
          p,
        ),
      ],
      charts: [
        withParams(
          {
            piece: 'stockAlertList',
            title: 'Alertas de stock',
            endpoint: '/stock/alerts',
            labelField: 'productName',
          },
          p,
        ),
        withParams(
          {
            piece: 'stockAlertList',
            title: 'Lotes por caducar',
            endpoint: '/stock/expiring',
            labelField: 'productName',
            valueField: 'quantity',
          },
          p,
        ),
      ],
    }),
  },

  // Rendimiento del equipo: ranking de ventas por vendedor + nº de ventas por vendedor.
  'staff-performance': {
    label: 'Rendimiento del equipo',
    recipe: 'kpiRow+twoCharts',
    build: (p) => ({
      charts: [
        withParams(
          {
            piece: 'rankBarList',
            title: 'Ventas por vendedor',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'comparisonBars',
            title: 'Nº de ventas por vendedor',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'salesCount',
            format: 'integer',
          },
          p,
        ),
      ],
    }),
  },

  // Ranking de productos: top de ventas (toRecords toma topSales, la primera lista de la respuesta).
  'product-ranking': {
    label: 'Ranking de productos',
    recipe: 'tableFull',
    build: (p) => ({
      charts: [
        withParams(
          {
            piece: 'rankBarList',
            title: 'Top productos por ventas',
            endpoint: '/dashboard/product-rankings',
            labelField: 'name',
            valueField: 'total',
            format: 'eur',
          },
          p,
        ),
      ],
    }),
  },

  // Rentabilidad: KPIs de margen (facturación / beneficio / % margen) + ventas por familia (de
  // dónde sale el dinero). Cubre el hueco de margen/beneficio que ningún otro bloque tenía.
  profitability: {
    label: 'Rentabilidad',
    recipe: 'kpiRow+oneChart',
    build: (p) => ({
      kpis: [
        withParams(
          {
            piece: 'kpiTile',
            title: 'Facturación',
            endpoint: '/dashboard/margin-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Beneficio',
            endpoint: '/dashboard/margin-kpis',
            valueField: 'realMargin',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: '% Margen',
            endpoint: '/dashboard/margin-kpis',
            valueField: 'marginPct',
            format: 'percentRatio',
          },
          p,
        ),
      ],
      charts: [
        withParams(
          {
            piece: 'comparisonBars',
            title: 'Ventas por familia',
            endpoint: '/dashboard/sales-by-family',
            labelField: 'familyName',
            valueField: 'total',
            format: 'eur',
          },
          p,
        ),
      ],
    }),
  },

  // Control de descuento y devoluciones: tasas (fuga de margen) + quién descuenta vs quién vende.
  // discountRate/returnRate/avgDiscountPct llegan como fracción 0..1 → percentRatio.
  'discount-control': {
    label: 'Control de descuento',
    recipe: 'kpiRow+twoCharts',
    build: (p) => ({
      kpis: [
        withParams(
          {
            piece: 'kpiTile',
            title: 'Tasa de descuento',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'discountRate',
            format: 'percentRatio',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Tasa de devolución',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'returnRate',
            format: 'percentRatio',
          },
          p,
        ),
      ],
      charts: [
        withParams(
          {
            piece: 'comparisonBars',
            title: 'Descuento por empleado',
            endpoint: '/dashboard/discount-by-employee',
            labelField: 'userName',
            valueField: 'avgDiscountPct',
            format: 'percentRatio',
          },
          p,
        ),
        withParams(
          {
            piece: 'comparisonBars',
            title: 'Ventas por vendedor',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
            format: 'eur',
          },
          p,
        ),
      ],
    }),
  },

  // Mix de ventas: donut hero del reparto por familia + KPIs de cabecera al lado (composición
  // protagonista). Estrena la receta heroChart+sideStats como bloque (gráfica grande 2fr + stats 1fr).
  'sales-mix': {
    label: 'Mix de ventas',
    recipe: 'heroChart+sideStats',
    build: (p) => ({
      kpis: [
        withParams(
          {
            piece: 'kpiTile',
            title: 'Facturación',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
          p,
        ),
        withParams(
          {
            piece: 'kpiTile',
            title: 'Ticket medio',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'avgTicket',
            format: 'eur',
          },
          p,
        ),
      ],
      charts: [
        withParams(
          {
            piece: 'shareDonut',
            title: 'Ventas por familia',
            endpoint: '/dashboard/sales-by-family',
            labelField: 'familyName',
            valueField: 'total',
            format: 'eur',
          },
          p,
        ),
      ],
    }),
  },
};

// Metadatos de catálogo de los bloques (paleta/snapshot/etiquetas). El render lo produce la
// colocación (un panel v2 bajo id gen:), no estos metadatos.
export const BLOCK_CATALOG: Record<
  string,
  { label: string; defaultSize: { w: number; h: number } }
> = Object.fromEntries(
  Object.entries(BLOCKS).map(([id, def]) => [
    `block:${id}`,
    { label: def.label, defaultSize: RECIPE_SIZE[def.recipe] },
  ]),
);

export const BLOCK_IDS: readonly string[] = Object.keys(BLOCKS).map((id) => `block:${id}`);

// Construye el GenericSpec (panel v2) de un bloque a partir de su id (`block:<id>` o `<id>`) y los
// params del agente. Devuelve null si el bloque no existe.
export function buildBlockSpec(blockId: string, params: BlockParams): GenericSpec | null {
  const id = blockId.startsWith('block:') ? blockId.slice('block:'.length) : blockId;
  const def = BLOCKS[id];
  if (!def) return null;
  return {
    type: 'composite', // bucket de compat; `kind:'panel'` manda en el render
    kind: 'panel',
    version: 2,
    endpoint: '',
    title: def.label,
    defaultSize: RECIPE_SIZE[def.recipe],
    recipe: def.recipe,
    density: 'comfortable',
    slots: def.build(params),
  };
}
