import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, fail, ok } from '../api.js';

export function registerSalesTools(server: McpServer): void {
  server.tool(
    'list_sales',
    'Lista las ventas registradas con filtros de tienda, rango de fechas y paginación. Devuelve importe, método de pago, empleado y estado de cada ticket.',
    {
      storeId: z.string().uuid().optional().describe('Filtrar por tienda'),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Máximo de registros (default 50)'),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/sales', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_sale_by_ticket',
    'Detalle completo de una venta por número de ticket: líneas con producto, cantidades, descuentos, método de pago y empleado.',
    {
      ticketNumber: z.string().describe('Número de ticket (ej: "00001-00000042")'),
    },
    async ({ ticketNumber }) => {
      try {
        return ok(await apiGet(`/sales/by-ticket/${encodeURIComponent(ticketNumber)}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_z_report',
    'Informe Z (cierre diario): resumen de ventas, desglose fiscal por tipo de IVA, número de secuencia y totales de caja. Equivale al cierre de día del TPV.',
    {
      storeId: z.string().uuid().optional(),
      date: z.string().optional().describe('Fecha YYYY-MM-DD (default: hoy)'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/z-report', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_returns',
    'Devoluciones registradas con motivo, importe, tienda y empleado que la tramitó. Incluye devoluciones ciegas (sin ticket original).',
    {
      storeId: z.string().uuid().optional(),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/returns', params));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
