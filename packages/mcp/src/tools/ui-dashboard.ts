import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, safe } from '../api.js';
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

/**
 * Tools con UI (MCP Apps): además de devolver datos, declaran un recurso `ui://`
 * que claude.ai renderiza como panel interactivo en el chat. El `structuredContent`
 * lleva los datos a la UI y el `content` (texto) un resumen breve para el modelo
 * → menos contexto que re-ingerir, menos latencia.
 *
 * Fase 1: solo get_company_overview. La vista vive en `src/ui` (bundle único
 * servido como `ui://simpletpv/dashboard.html`).
 */
const RESOURCE_URI = 'ui://simpletpv/dashboard.html';

let cachedHtml: string | null = null;
async function dashboardHtml(): Promise<string> {
  if (cachedHtml != null) return cachedHtml;
  // En runtime: dist/tools/ui-dashboard.js → dist/ui/index.html (bundle de Vite)
  const file = path.join(import.meta.dirname, '..', 'ui', 'index.html');
  cachedHtml = await readFile(file, 'utf-8');
  return cachedHtml;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

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

function getPath(obj: unknown, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Resumen breve (para el modelo) del overview; los datos completos van en structuredContent. */
function overviewSummary(d: Record<string, unknown>): string {
  const today = asNumber(getPath(d, ['salesDay', 'today', 'total']));
  const tickets = asNumber(getPath(d, ['salesDay', 'today', 'count']));
  const open = asNumber(getPath(d, ['stockoutKpis', 'open']));
  const alertsVal = d['alerts'];
  const alerts = Array.isArray(alertsVal) ? alertsVal.length : null;

  const parts: string[] = [];
  if (today != null)
    parts.push(`ventas hoy ${today} €${tickets != null ? ` (${tickets} tickets)` : ''}`);
  if (alerts != null) parts.push(`${alerts} alertas de stock`);
  if (open != null) parts.push(`${open} roturas abiertas`);

  const detail = parts.length > 0 ? parts.join(' · ') : 'sin datos disponibles';
  return `Resumen del negocio — ${detail}. El panel visual con el detalle se muestra al usuario.`;
}

/** Resumen breve del análisis de ventas (los datos completos van en structuredContent). */
function breakdownSummary(d: Record<string, unknown>, report?: ReportMetrics): string {
  const revenue = asNumber(getPath(d, ['kpis', 'revenue']));
  const tickets = asNumber(getPath(d, ['kpis', 'salesCount']));
  const marginPct = asNumber(getPath(d, ['margin', 'marginPct']));
  const parts: string[] = [];
  if (revenue != null) parts.push(`facturación ${revenue} €`);
  if (tickets != null) parts.push(`${tickets} tickets`);
  if (marginPct != null) parts.push(`margen ${(marginPct * 100).toFixed(1)} %`);
  const detail = parts.length > 0 ? parts.join(' · ') : 'sin ventas en el período';
  if (report) {
    const proj = Math.round(report.dailyAvg.revenue.projection);
    return (
      `Informe de ventas ${report.current.label} (día ${report.current.daysElapsed} de ${report.current.daysInMonth}) — ${detail}. ` +
      `Media diaria ${Math.round(report.dailyAvg.revenue.current)} €/día (vs ${Math.round(report.dailyAvg.revenue.previous)} €/día en ${report.previous.label}); ` +
      `proyección a fin de mes ${proj} €. El panel muestra comparativa, acumulado diario y desglose por tienda/familia/empleado/hora.`
    );
  }
  return `Análisis de ventas — ${detail}. Desglose por tienda/familia/empleado/hora en el panel.`;
}

export function registerUiDashboardTools(server: McpServer): void {
  registerAppResource(
    server,
    'Panel SimpleTpv',
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: await dashboardHtml() }],
    }),
  );

  registerAppTool(
    server,
    'get_company_overview',
    {
      title: 'Resumen del negocio',
      description:
        'Resumen ejecutivo del estado actual del negocio en UNA sola llamada: ventas de hoy con comparativa, KPIs de ventas, alertas de rotura de stock y métricas de stockout del mes. Se muestra como panel visual interactivo. Úsalo como punto de partida o cuando el usuario pregunte por el estado general; prefiérelo a pedir esas métricas con tools sueltas.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async () => {
      const [salesDay, kpis, stockoutKpis, alerts] = await Promise.all([
        safe(apiGet('/dashboard/sales-today', { compare: 'day' })),
        safe(apiGet('/dashboard/sales-kpis', { period: 'today' })),
        safe(apiGet('/dashboard/stockout-kpis', { period: 'month' })),
        safe(apiGet('/stock/alerts')),
      ]);
      const structuredContent = { kind: 'overview', salesDay, kpis, stockoutKpis, alerts };
      return {
        content: [{ type: 'text', text: overviewSummary(structuredContent) }],
        structuredContent,
      };
    },
  );

  registerAppTool(
    server,
    'get_sales_breakdown',
    {
      title: 'Análisis de ventas',
      description:
        'Informe de ventas COMPLETO en una sola llamada: para el mes en curso incluye comparativa con el mes anterior (en bruto y en media diaria comparable), proyección a fin de mes, acumulado diario y desglose por tienda, familia, franja horaria y empleado. Se muestra como panel visual con tarjetas y gráficos. Por defecto el período es el mes en curso. Úsalo cuando el usuario pida "analizar las ventas", "cómo va el mes" o un informe global en lugar de encadenar tools de desglose sueltas.',
      inputSchema: { period, storeId },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (params) => {
      // El informe es mensual por defecto: sin period explícito, mes en curso.
      const period = params.period ?? 'month';
      const storeId = params.storeId;
      const prevPeriod = PREVIOUS_PERIOD[period];
      // La comparativa rica (media diaria/proyección/acumulado) es específica del
      // mes; para otros periodos se devuelve solo el desglose dimensional.
      const wantsReport = period === 'month';

      const [kpis, margin, byStore, byFamily, byHour, byEmployee] = await Promise.all([
        safe(apiGet('/dashboard/sales-kpis', { period, storeId })),
        safe(apiGet('/dashboard/margin-kpis', { period, storeId })),
        safe(apiGet('/dashboard/sales-by-store', { period })),
        safe(apiGet('/dashboard/sales-by-family', { period, storeId })),
        safe(apiGet('/dashboard/sales-by-hour', { period, storeId })),
        safe(apiGet('/dashboard/sales-by-employee', { period, storeId })),
      ]);

      let report: ReportMetrics | undefined;
      if (wantsReport && prevPeriod) {
        const [prevKpis, prevMargin, dailyCur, dailyPrev] = await Promise.all([
          safe(apiGet('/dashboard/sales-kpis', { period: prevPeriod, storeId })),
          safe(apiGet('/dashboard/margin-kpis', { period: prevPeriod, storeId })),
          safe(apiGet('/dashboard/sales-by-day', { period, storeId })),
          safe(apiGet('/dashboard/sales-by-day', { period: prevPeriod, storeId })),
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

      const structuredContent = {
        kind: 'breakdown',
        period,
        kpis,
        margin,
        byStore,
        byFamily,
        byHour,
        byEmployee,
        report,
      };
      return {
        content: [{ type: 'text', text: breakdownSummary(structuredContent, report) }],
        structuredContent,
      };
    },
  );
}
