import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, fail, ok } from '../api.js';

export function registerStockTools(server: McpServer): void {
  server.tool(
    'get_stock_global',
    'Inventario global de todos los productos de la organización: unidades en stock, stock mínimo y estado de alerta. Vista agregada de todos los almacenes.',
    {},
    async () => {
      try {
        return ok(await apiGet('/stock/global'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_stock_by_store',
    'Inventario de una tienda concreta: unidades disponibles por producto. Si no se indica tienda, devuelve el stock del almacén del usuario autenticado.',
    {
      storeId: z.string().uuid().optional().describe('UUID de tienda'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/stock', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_stock_alerts',
    'Alertas de stock activas: productos agotados o por debajo del mínimo configurado. Imprescindible para gestión de reposición.',
    {
      storeId: z.string().uuid().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/stock/alerts', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_expiring_stock',
    'Lotes de producto próximos a caducar (para artículos con trazabilidad FEFO activada). Ordenados por fecha de caducidad más próxima.',
    {
      storeId: z.string().uuid().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/stock/expiring', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_stock_movements',
    'Historial de movimientos de inventario: entradas, salidas, ajustes, traspasos y devoluciones. Audit trail completo del stock.',
    {
      productId: z.string().uuid().optional().describe('Filtrar por producto'),
      storeId: z.string().uuid().optional().describe('Filtrar por tienda'),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/stock/movements', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_products_to_reorder',
    'Lista de productos que necesitan reposición según stock mínimo configurado. Incluye el déficit calculado y el proveedor habitual para facilitar la generación de pedidos.',
    {
      storeId: z.string().uuid().optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/stock/to-reorder', params));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
