import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, safe } from '../api.js';
import { readTool } from './register.js';
import { buildReportMetrics, type DailyPoint, type ReportMetrics } from './report-math.js';

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

/** Lee un campo numérico de una rama `safe()` (puede ser `{ error }`); 0 si falta. */
function fieldNum(v: unknown, key: string): number {
  if (v != null && typeof v === 'object' && !('error' in v)) {
    const n = (v as Record<string, unknown>)[key];
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return 0;
}

/** Normaliza la rama `sales-by-day` (array | `{ error }`) a puntos `{ day, revenue }`. */
function asDaily(v: unknown): DailyPoint[] {
  if (!Array.isArray(v)) return [];
  return v.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const revenue = typeof o.revenue === 'number' && Number.isFinite(o.revenue) ? o.revenue : 0;
    return { day: typeof o.day === 'string' ? o.day : '', revenue };
  });
}

/**
 * Periodo anterior equivalente para la comparativa. Solo los periodos "completos"
 * tienen un anterior natural; today/yesterday/custom no comparan.
 */
const PREVIOUS_PERIOD: Record<string, string | undefined> = {
  week: 'last_week',
  month: 'last_month',
  quarter: 'last_quarter',
  year: 'last_year',
};

/**
 * Tools compuestas del dashboard (fan-out server-side con `Promise.all` → 1 round-trip).
 * Devuelven SOLO datos (JSON); el cliente decide cómo presentarlos. Antes declaraban
 * un panel `ui://` (MCP Apps) que renderizaba un iframe con el design system del
 * backoffice; se retiró por preferencia del usuario (que la UI la componga el modelo).
 */
export function registerDashboardComposites(server: McpServer): void {
  readTool(
    server,
    'get_company_overview',
    'Resumen ejecutivo del estado actual del negocio en UNA sola llamada: ventas de hoy con comparativa, KPIs de ventas, alertas de rotura de stock y métricas de stockout del mes. Úsalo como punto de partida o cuando el usuario pregunte por el estado general; prefiérelo a pedir esas métricas con tools sueltas. Devuelve los datos para que los presentes de forma visual y clara.',
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
    'Informe de ventas COMPLETO en una sola llamada: para el mes en curso incluye comparativa con el mes anterior (en bruto y en media diaria comparable), proyección a fin de mes, acumulado diario y desglose por tienda, familia, franja horaria y empleado. Por defecto el período es el mes en curso. Úsalo cuando el usuario pida "analizar las ventas", "cómo va el mes" o un informe global en lugar de encadenar tools de desglose sueltas. Devuelve los datos para que los presentes de forma visual y clara.',
    { period, storeId },
    async (params) => {
      // El informe es mensual por defecto: sin period explícito, mes en curso.
      const resolvedPeriod = params.period ?? 'month';
      const store = params.storeId;
      const prevPeriod = PREVIOUS_PERIOD[resolvedPeriod];
      // La comparativa rica (media diaria/proyección/acumulado) es específica del
      // mes; para otros periodos se devuelve solo el desglose dimensional.
      const wantsReport = resolvedPeriod === 'month';

      const [kpis, margin, byStore, byFamily, byHour, byEmployee] = await Promise.all([
        safe(apiGet('/dashboard/sales-kpis', { period: resolvedPeriod, storeId: store })),
        safe(apiGet('/dashboard/margin-kpis', { period: resolvedPeriod, storeId: store })),
        safe(apiGet('/dashboard/sales-by-store', { period: resolvedPeriod })),
        safe(apiGet('/dashboard/sales-by-family', { period: resolvedPeriod, storeId: store })),
        safe(apiGet('/dashboard/sales-by-hour', { period: resolvedPeriod, storeId: store })),
        safe(apiGet('/dashboard/sales-by-employee', { period: resolvedPeriod, storeId: store })),
      ]);

      let report: ReportMetrics | undefined;
      if (wantsReport && prevPeriod) {
        const [prevKpis, prevMargin, dailyCur, dailyPrev] = await Promise.all([
          safe(apiGet('/dashboard/sales-kpis', { period: prevPeriod, storeId: store })),
          safe(apiGet('/dashboard/margin-kpis', { period: prevPeriod, storeId: store })),
          safe(apiGet('/dashboard/sales-by-day', { period: resolvedPeriod, storeId: store })),
          safe(apiGet('/dashboard/sales-by-day', { period: prevPeriod, storeId: store })),
        ]);
        report = buildReportMetrics({
          now: new Date(),
          current: {
            revenue: fieldNum(kpis, 'revenue'),
            salesCount: fieldNum(kpis, 'salesCount'),
            marginPct: fieldNum(margin, 'marginPct'),
          },
          previous: {
            revenue: fieldNum(prevKpis, 'revenue'),
            salesCount: fieldNum(prevKpis, 'salesCount'),
            marginPct: fieldNum(prevMargin, 'marginPct'),
          },
          dailyCurrent: asDaily(dailyCur),
          dailyPrevious: asDaily(dailyPrev),
        });
      }

      return {
        period: resolvedPeriod,
        kpis,
        margin,
        byStore,
        byFamily,
        byHour,
        byEmployee,
        report,
      };
    },
  );
}
