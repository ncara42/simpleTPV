import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet } from '../api.js';
import { readTool } from './register.js';

const period = z
  .enum([
    'today',
    'yesterday',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'this_quarter',
    'this_year',
    'custom',
  ])
  .optional()
  .describe('Período de análisis. Usa "custom" junto con from y to para rangos personalizados');

const storeId = z.string().uuid().optional().describe('UUID de tienda para filtrar resultados');

const dateFrom = z.string().optional().describe('Fecha inicio YYYY-MM-DD (solo si period=custom)');
const dateTo = z.string().optional().describe('Fecha fin YYYY-MM-DD (solo si period=custom)');

export function registerDashboardTools(server: McpServer): void {
  readTool(
    server,
    'get_company_overview',
    'Resumen ejecutivo del estado actual del negocio en UNA sola llamada: ventas de hoy con comparativa, KPIs de ventas, alertas de rotura de stock y métricas de stockout del mes. Úsalo como punto de partida para cualquier análisis o cuando el usuario pregunte por el estado general de la empresa; prefiérelo a pedir esas métricas con tools sueltas.',
    {},
    async () => {
      const [salesDay, kpis, stockoutKpis, alerts] = await Promise.all([
        apiGet('/dashboard/sales-today', { compare: 'day' }),
        apiGet('/dashboard/sales-kpis', { period: 'today' }),
        apiGet('/dashboard/stockout-kpis', { period: 'this_month' }),
        apiGet('/stock/alerts'),
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
        apiGet('/dashboard/sales-kpis', params),
        apiGet('/dashboard/margin-kpis', params),
        apiGet('/dashboard/sales-by-store', { period: params.period }),
        apiGet('/dashboard/sales-by-family', params),
        apiGet('/dashboard/sales-by-hour', params),
        apiGet('/dashboard/sales-by-employee', params),
      ]);
      return { kpis, margin, byStore, byFamily, byHour, byEmployee };
    },
  );

  readTool(
    server,
    'get_sales_kpis',
    'KPIs agregados de ventas: importe total vendido, ticket medio, número de tickets, margen bruto (%) y tasa de descuento (%). Acepta filtro de período y tienda concreta.',
    { period, from: dateFrom, to: dateTo, storeId },
    (params) => apiGet('/dashboard/sales-kpis', params),
  );

  readTool(
    server,
    'get_sales_today',
    'Ventas del día en curso: importe total, nº de líneas y variación porcentual respecto al período anterior.',
    {
      compare: z
        .enum(['day', 'week'])
        .optional()
        .describe('"day" compara con el día anterior, "week" con el mismo día de la semana pasada'),
      storeId,
    },
    (params) => apiGet('/dashboard/sales-today', params),
  );

  readTool(
    server,
    'get_sales_by_store',
    'Desglose de ventas por tienda: importe y número de tickets de cada local. Ideal para comparar rendimiento entre tiendas.',
    { period },
    ({ period }) => apiGet('/dashboard/sales-by-store', { period }),
  );

  readTool(
    server,
    'get_sales_by_product_family',
    'Ventas desglosadas por familia de producto: importe, unidades vendidas y margen por categoría. Análisis de mix de producto.',
    { period, storeId },
    (params) => apiGet('/dashboard/sales-by-family', params),
  );

  readTool(
    server,
    'get_sales_by_hour',
    'Distribución horaria de ventas: importe y nº de transacciones por franja horaria. Sirve para identificar picos de demanda y optimizar turnos.',
    { period, storeId },
    (params) => apiGet('/dashboard/sales-by-hour', params),
  );

  readTool(
    server,
    'get_sales_by_employee',
    'Rendimiento de ventas por empleado: importe total generado y número de tickets. Permite comparar productividad del equipo.',
    { period, storeId },
    (params) => apiGet('/dashboard/sales-by-employee', params),
  );

  readTool(
    server,
    'get_discount_by_employee',
    'Análisis de descuentos por empleado: importe total descontado y tasa de descuento sobre ventas. Útil para detectar abuso de descuentos o premiar disciplina comercial.',
    { period },
    ({ period }) => apiGet('/dashboard/discount-by-employee', { period }),
  );

  readTool(
    server,
    'get_margin_kpis',
    'KPIs de rentabilidad: importe de margen bruto, porcentaje de margen y coste de las mercancías vendidas (COGS). Fundamental para análisis de rentabilidad.',
    { period, storeId },
    (params) => apiGet('/dashboard/margin-kpis', params),
  );

  readTool(
    server,
    'get_stockout_kpis',
    'Métricas de rotura de stock: alertas totales, productos agotados y stock crítico. Mide el riesgo operativo del inventario.',
    { period, storeId },
    (params) => apiGet('/dashboard/stockout-kpis', params),
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
    'get_product_rotation',
    'Análisis de rotación de inventario por producto: días en stock y tasa de turnover. Identifica exceso de stock o alta rotación.',
    { period, storeId },
    (params) => apiGet('/dashboard/product-rotation', params),
  );

  readTool(
    server,
    'get_archetype_rotation',
    'Rotación a nivel de arquetipo/categoría hoja: turnover y margen por familia de productos. Vista estratégica del portfolio.',
    { period },
    ({ period }) => apiGet('/dashboard/archetype-rotation', { period }),
  );
}
