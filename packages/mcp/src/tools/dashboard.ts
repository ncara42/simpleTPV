import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, safe } from '../api.js';
import { readTool } from './register.js';

const period = z
  .enum([
    'today',
    'yesterday',
    'week',
    'last_week',
    'month',
    'last_month',
    'quarter',
    'last_quarter',
    'year',
    'last_year',
    'custom',
  ])
  .optional()
  .describe('Período de análisis. Usa "custom" junto con from y to para rangos personalizados');

const storeId = z.string().uuid().optional().describe('UUID de tienda para filtrar resultados');

const dateFrom = z.string().optional().describe('Fecha inicio YYYY-MM-DD (solo si period=custom)');
const dateTo = z.string().optional().describe('Fecha fin YYYY-MM-DD (solo si period=custom)');

/** Mapa dimensión → endpoint del desglose de ventas (consolidado en get_sales_by_dimension). */
const SALES_DIMENSION_ENDPOINT = {
  store: '/dashboard/sales-by-store',
  family: '/dashboard/sales-by-family',
  hour: '/dashboard/sales-by-hour',
  employee: '/dashboard/sales-by-employee',
  discount_by_employee: '/dashboard/discount-by-employee',
} as const;
/** Dimensiones cuyo endpoint admite filtrar por tienda (las demás solo por período). */
const SALES_DIMENSION_STORE_SCOPED = new Set(['family', 'hour', 'employee']);

/** Mapa grupo → endpoint de KPIs (consolidado en get_kpis). */
const KPI_ENDPOINT = {
  sales: '/dashboard/sales-kpis',
  margin: '/dashboard/margin-kpis',
  stockout: '/dashboard/stockout-kpis',
} as const;

/** Mapa nivel → endpoint de rotación (consolidado en get_rotation). */
const ROTATION_ENDPOINT = {
  product: '/dashboard/product-rotation',
  archetype: '/dashboard/archetype-rotation',
} as const;

export function registerDashboardTools(server: McpServer): void {
  readTool(
    server,
    'get_company_overview',
    'Resumen ejecutivo del estado actual del negocio en UNA sola llamada: ventas de hoy con comparativa, KPIs de ventas, alertas de rotura de stock y métricas de stockout del mes. Úsalo como punto de partida para cualquier análisis o cuando el usuario pregunte por el estado general de la empresa; prefiérelo a pedir esas métricas con tools sueltas.',
    {},
    async () => {
      const [salesDay, kpis, stockoutKpis, alerts] = await Promise.all([
        safe(apiGet('/dashboard/sales-today', { compare: 'day' })),
        safe(apiGet('/dashboard/sales-kpis', { period: 'today' })),
        safe(apiGet('/dashboard/stockout-kpis', { period: 'month' })),
        safe(apiGet('/stock/alerts')),
      ]);
      return { salesDay, kpis, stockoutKpis, alerts };
    },
  );

  readTool(
    server,
    'get_sales_breakdown',
    'Análisis de ventas COMPLETO en una sola llamada: KPIs, margen y desglose por tienda, familia, franja horaria y empleado para el período indicado. Úsalo cuando el usuario pida "analizar las ventas" o un informe global en lugar de encadenar varias tools de desglose por separado.',
    { period, storeId },
    async (params) => {
      const [kpis, margin, byStore, byFamily, byHour, byEmployee] = await Promise.all([
        safe(apiGet('/dashboard/sales-kpis', params)),
        safe(apiGet('/dashboard/margin-kpis', params)),
        safe(apiGet('/dashboard/sales-by-store', { period: params.period })),
        safe(apiGet('/dashboard/sales-by-family', params)),
        safe(apiGet('/dashboard/sales-by-hour', params)),
        safe(apiGet('/dashboard/sales-by-employee', params)),
      ]);
      return { kpis, margin, byStore, byFamily, byHour, byEmployee };
    },
  );

  readTool(
    server,
    'get_kpis',
    'KPIs agregados según el grupo solicitado: "sales" (importe total, ticket medio, nº de tickets, margen bruto %, tasa de descuento %), "margin" (margen bruto, % de margen, COGS) o "stockout" (alertas totales, productos agotados, stock crítico). Para un único grupo concreto; si necesitas el cuadro completo de ventas usa get_sales_breakdown.',
    {
      group: z
        .enum(['sales', 'margin', 'stockout'])
        .describe(
          'Grupo de KPIs: sales = ventas, margin = rentabilidad, stockout = rotura de stock',
        ),
      period,
      from: dateFrom,
      to: dateTo,
      storeId,
    },
    ({ group, period, from, to, storeId }) =>
      apiGet(
        KPI_ENDPOINT[group],
        group === 'sales' ? { period, from, to, storeId } : { period, storeId },
      ),
  );

  readTool(
    server,
    'get_sales_today',
    'Ventas del día en curso: importe total, nº de líneas y variación porcentual respecto al período anterior.',
    {
      compare: z
        .enum(['day', 'month', 'year'])
        .optional()
        .describe(
          'Comparativa: "day" vs día anterior, "month" vs mes anterior, "year" vs año anterior',
        ),
      storeId,
    },
    (params) => apiGet('/dashboard/sales-today', params),
  );

  readTool(
    server,
    'get_sales_by_dimension',
    'Desglose de ventas según la dimensión indicada: "store" (importe y tickets por tienda), "family" (importe, unidades y margen por familia de producto), "hour" (distribución horaria para detectar picos), "employee" (rendimiento por empleado) o "discount_by_employee" (descuentos aplicados por cada empleado, para detectar abuso). Para el cuadro completo de una vez usa get_sales_breakdown.',
    {
      dimension: z
        .enum(['store', 'family', 'hour', 'employee', 'discount_by_employee'])
        .describe('Dimensión del desglose de ventas'),
      period,
      storeId,
    },
    ({ dimension, period, storeId }) =>
      apiGet(
        SALES_DIMENSION_ENDPOINT[dimension],
        SALES_DIMENSION_STORE_SCOPED.has(dimension) ? { period, storeId } : { period },
      ),
  );

  readTool(
    server,
    'get_product_rankings',
    'Rankings de productos: los más vendidos (top sellers) y los de menor rotación (slow movers) por importe y unidades.',
    {
      period,
      storeId,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Nº de productos por ranking (default 10)'),
    },
    (params) => apiGet('/dashboard/product-rankings', params),
  );

  readTool(
    server,
    'get_rotation',
    'Análisis de rotación de inventario al nivel indicado: "product" (días en stock y turnover por producto, identifica exceso o alta rotación) o "archetype" (turnover y margen por arquetipo/categoría hoja, vista estratégica del portfolio).',
    {
      level: z
        .enum(['product', 'archetype'])
        .describe('Nivel de análisis: product = por producto, archetype = por categoría hoja'),
      period,
      storeId,
    },
    ({ level, period, storeId }) =>
      apiGet(ROTATION_ENDPOINT[level], level === 'product' ? { period, storeId } : { period }),
  );
}
