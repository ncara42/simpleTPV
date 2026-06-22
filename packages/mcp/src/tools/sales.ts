import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet } from '../api.js';
import { readTool } from './register.js';

export function registerSalesTools(server: McpServer): void {
  readTool(
    server,
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
    // Cap por defecto (50) cuando el modelo omite `limit`: acota el payload que
    // re-ingiere el modelo (Anthropic: sensible defaults + caps). Override libre.
    (params) => apiGet('/sales', { limit: 50, ...params }),
  );

  readTool(
    server,
    'get_sale_by_ticket',
    'Detalle completo de una venta por número de ticket: líneas con producto, cantidades, descuentos, método de pago y empleado.',
    {
      ticketNumber: z.string().describe('Número de ticket (ej: "00001-00000042")'),
    },
    ({ ticketNumber }) => apiGet(`/sales/by-ticket/${encodeURIComponent(ticketNumber)}`),
  );

  readTool(
    server,
    'get_z_report',
    'Informe Z (cierre diario) de una tienda: resumen de ventas, desglose fiscal por tipo de IVA, número de secuencia y totales de caja. Requiere indicar la tienda (el cierre es por tienda).',
    {
      storeId: z
        .string()
        .uuid()
        .describe('UUID de tienda (obligatorio; el cierre Z es por tienda)'),
      date: z.string().describe('Fecha del cierre YYYY-MM-DD (obligatorio)'),
    },
    (params) => apiGet('/z-report', params),
  );

  readTool(
    server,
    'list_returns',
    'Devoluciones de una venta concreta: motivo, importe, líneas y empleado que la tramitó. Requiere el ID de la venta (obtén el saleId con list_sales).',
    {
      saleId: z
        .string()
        .uuid()
        .describe('UUID de la venta cuyas devoluciones quieres (obligatorio)'),
    },
    (params) => apiGet('/returns', params),
  );
}
