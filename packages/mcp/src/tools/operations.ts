import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet } from '../api.js';
import { readTool } from './register.js';

export function registerOperationsTools(server: McpServer): void {
  readTool(
    server,
    'list_purchase_orders',
    'Órdenes de compra a proveedores: estado, proveedor, tienda destino, líneas e importes. Incluye pedidos en borrador, confirmados y recibidos.',
    {
      status: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED']).optional(),
      supplierId: z.string().uuid().optional(),
      storeId: z.string().uuid().optional(),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
    },
    (params) => apiGet('/purchase-orders', params),
  );

  readTool(
    server,
    'list_transfers',
    'Traspasos de mercancía entre tiendas: estado, tienda origen y destino, líneas con cantidades enviadas/recibidas y discrepancias detectadas.',
    {
      status: z.enum(['DRAFT', 'SENT', 'RECEIVED', 'CLOSED']).optional(),
      storeId: z.string().uuid().optional().describe('Filtrar por tienda origen o destino'),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    (params) => apiGet('/transfers', params),
  );

  readTool(
    server,
    'list_cash_sessions',
    'Sesiones de caja cerradas: empleado, tienda, hora de apertura y cierre, efectivo inicial/final y movimientos. Útil para conciliación y auditoría de caja.',
    {
      storeId: z.string().uuid().optional(),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
    },
    (params) => apiGet('/cash-sessions/closed', params),
  );

  readTool(
    server,
    'get_time_clock_history',
    'Registro de fichajes de todos los empleados: entradas, salidas y pausas con timestamp. Permite calcular horas trabajadas por empleado y período.',
    {
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      storeId: z.string().uuid().optional(),
    },
    (params) => apiGet('/time-clock/history-all', params),
  );

  readTool(
    server,
    'list_wholesale_orders',
    'Pedidos mayoristas B2B: cliente, estado, líneas de producto y totales. Para gestión de clientes con tarifa especial.',
    {
      status: z.enum(['DRAFT', 'SENT', 'RECEIVED']).optional(),
      customerId: z.string().uuid().optional(),
    },
    (params) => apiGet('/wholesale-orders', params),
  );

  readTool(
    server,
    'list_customers',
    'Clientes B2B: nombre, NIF, email y teléfono. Son los clientes mayoristas con tarifa diferenciada.',
    {},
    () => apiGet('/customers'),
  );
}
