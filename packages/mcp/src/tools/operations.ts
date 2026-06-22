import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, fail, ok } from '../api.js';

export function registerOperationsTools(server: McpServer): void {
  server.tool(
    'list_purchase_orders',
    'Órdenes de compra a proveedores: estado, proveedor, tienda destino, líneas e importes. Incluye pedidos en borrador, confirmados y recibidos.',
    {
      status: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED']).optional(),
      supplierId: z.string().uuid().optional(),
      storeId: z.string().uuid().optional(),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/purchase-orders', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_transfers',
    'Traspasos de mercancía entre tiendas: estado, tienda origen y destino, líneas con cantidades enviadas/recibidas y discrepancias detectadas.',
    {
      status: z.enum(['DRAFT', 'SENT', 'RECEIVED', 'CLOSED']).optional(),
      storeId: z.string().uuid().optional().describe('Filtrar por tienda origen o destino'),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/transfers', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_cash_sessions',
    'Sesiones de caja cerradas: empleado, tienda, hora de apertura y cierre, efectivo inicial/final y movimientos. Útil para conciliación y auditoría de caja.',
    {
      storeId: z.string().uuid().optional(),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/cash-sessions/closed', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_time_clock_history',
    'Registro de fichajes de todos los empleados: entradas, salidas y pausas con timestamp. Permite calcular horas trabajadas por empleado y período.',
    {
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      storeId: z.string().uuid().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/time-clock/history-all', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_wholesale_orders',
    'Pedidos mayoristas B2B: cliente, estado, líneas de producto y totales. Para gestión de clientes con tarifa especial.',
    {
      status: z.enum(['DRAFT', 'SENT', 'RECEIVED']).optional(),
      customerId: z.string().uuid().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/wholesale-orders', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_customers',
    'Clientes B2B: nombre, NIF, email y teléfono. Son los clientes mayoristas con tarifa diferenciada.',
    {},
    async () => {
      try {
        return ok(await apiGet('/customers'));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
