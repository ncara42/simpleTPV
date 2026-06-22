import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet } from '../api.js';
import { readTool } from './register.js';

export function registerStockTools(server: McpServer): void {
  readTool(
    server,
    'get_inventory_health',
    'Estado de salud del inventario en UNA sola llamada: alertas activas, productos a reponer (con déficit y proveedor habitual), lotes próximos a caducar y métricas de rotura del mes. Úsalo cuando el usuario pregunte "¿cómo está mi inventario?" o "¿qué tengo que reponer?" en lugar de encadenar varias tools de stock.',
    {
      storeId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID de tienda (omitir = toda la organización)'),
    },
    async (params) => {
      const [alerts, toReorder, expiring, stockoutKpis] = await Promise.all([
        apiGet('/stock/alerts', params),
        apiGet('/stock/to-reorder', params),
        apiGet('/stock/expiring', params),
        apiGet('/dashboard/stockout-kpis', { period: 'month', ...params }),
      ]);
      return { alerts, toReorder, expiring, stockoutKpis };
    },
  );

  readTool(
    server,
    'get_stock_global',
    'Inventario global de todos los productos de la organización: unidades en stock, stock mínimo y estado de alerta. Vista agregada de todos los almacenes.',
    {},
    () => apiGet('/stock/global'),
  );

  readTool(
    server,
    'get_stock_by_store',
    'Inventario de una tienda concreta: unidades disponibles por producto. Si no se indica tienda, devuelve el stock del almacén del usuario autenticado.',
    {
      storeId: z.string().uuid().optional().describe('UUID de tienda'),
    },
    (params) => apiGet('/stock', params),
  );

  readTool(
    server,
    'get_stock_alerts',
    'Alertas de stock activas: productos agotados o por debajo del mínimo configurado. Imprescindible para gestión de reposición.',
    {
      storeId: z.string().uuid().optional(),
    },
    (params) => apiGet('/stock/alerts', params),
  );

  readTool(
    server,
    'get_expiring_stock',
    'Lotes de producto próximos a caducar (para artículos con trazabilidad FEFO activada). Ordenados por fecha de caducidad más próxima.',
    {
      storeId: z.string().uuid().optional(),
    },
    (params) => apiGet('/stock/expiring', params),
  );

  readTool(
    server,
    'get_stock_movements',
    'Historial de movimientos de inventario: entradas, salidas, ajustes, traspasos y devoluciones. Audit trail completo del stock.',
    {
      productId: z.string().uuid().optional().describe('Filtrar por producto'),
      storeId: z.string().uuid().optional().describe('Filtrar por tienda'),
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    // Cap por defecto (100) si el modelo omite `limit`: el audit trail puede ser
    // enorme; acota con productId/storeId/fechas para análisis concretos.
    (params) => apiGet('/stock/movements', { limit: 100, ...params }),
  );

  readTool(
    server,
    'get_products_to_reorder',
    'Lista de productos que necesitan reposición según stock mínimo configurado. Incluye el déficit calculado y el proveedor habitual para facilitar la generación de pedidos.',
    {
      storeId: z.string().uuid().optional(),
    },
    (params) => apiGet('/stock/to-reorder', params),
  );
}
