import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet } from '../api.js';
import { readTool } from './register.js';

export function registerCatalogTools(server: McpServer): void {
  readTool(
    server,
    'list_products',
    'Catálogo de productos: nombre, código de barras, precio de venta, coste, margen, familia y estado. Soporta búsqueda por texto y filtro por familia.',
    {
      search: z.string().optional().describe('Texto de búsqueda (nombre o código de barras)'),
      familyId: z.string().uuid().optional().describe('Filtrar por familia de producto'),
      limit: z.number().int().min(1).max(500).optional(),
      page: z.number().int().min(1).optional(),
    },
    // Cap por defecto (100) si el modelo omite `limit`; usa `search`/`familyId`
    // para acotar en vez de paginar a ciegas. Override libre.
    (params) => apiGet('/products', { limit: 100, ...params }),
  );

  readTool(
    server,
    'get_product_families',
    'Árbol de familias y categorías de productos con jerarquía. Incluye arquetipos (categorías hoja usadas en análisis de rotación y mix).',
    {},
    () => apiGet('/product-families'),
  );

  readTool(
    server,
    'list_stores',
    'Tiendas de la organización: nombre, estado operativo (abierto/cerrado), si es tienda central y configuración de operaciones.',
    {},
    () => apiGet('/stores'),
  );

  readTool(
    server,
    'list_users',
    'Equipo de la empresa: empleados con nombre, rol (ADMIN/MANAGER/CLERK), tiendas asignadas y estado activo/inactivo.',
    {},
    () => apiGet('/users'),
  );

  readTool(
    server,
    'list_suppliers',
    'Proveedores de la empresa: nombre, NIF, email, teléfono y plazo de entrega habitual. Base para análisis de compras.',
    {},
    () => apiGet('/suppliers'),
  );

  readTool(
    server,
    'get_supplier_price_comparison',
    'Comparativa de precios de coste entre todos los proveedores para un mismo producto. Permite identificar el proveedor más competitivo y negociar mejores tarifas.',
    {
      productId: z.string().uuid().optional().describe('Filtrar para un producto concreto'),
    },
    (params) => apiGet('/supplier-prices/comparison', params),
  );

  readTool(
    server,
    'list_promotions',
    'Promociones configuradas: condición de aplicación (cantidad mínima o importe mínimo de ticket), tipo de descuento y período de vigencia.',
    {
      active: z.boolean().optional().describe('true = solo activas, false = solo inactivas'),
    },
    (params) => apiGet('/promotions', params),
  );
}
