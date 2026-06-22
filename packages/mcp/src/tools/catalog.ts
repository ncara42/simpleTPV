import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { apiGet, fail, ok } from '../api.js';

export function registerCatalogTools(server: McpServer): void {
  server.tool(
    'list_products',
    'Catálogo de productos: nombre, código de barras, precio de venta, coste, margen, familia y estado. Soporta búsqueda por texto y filtro por familia.',
    {
      search: z.string().optional().describe('Texto de búsqueda (nombre o código de barras)'),
      familyId: z.string().uuid().optional().describe('Filtrar por familia de producto'),
      limit: z.number().int().min(1).max(500).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      try {
        return ok(await apiGet('/products', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_product_families',
    'Árbol de familias y categorías de productos con jerarquía. Incluye arquetipos (categorías hoja usadas en análisis de rotación y mix).',
    {},
    async () => {
      try {
        return ok(await apiGet('/product-families'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_stores',
    'Tiendas de la organización: nombre, estado operativo (abierto/cerrado), si es tienda central y configuración de operaciones.',
    {},
    async () => {
      try {
        return ok(await apiGet('/stores'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_users',
    'Equipo de la empresa: empleados con nombre, rol (ADMIN/MANAGER/CLERK), tiendas asignadas y estado activo/inactivo.',
    {},
    async () => {
      try {
        return ok(await apiGet('/users'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_suppliers',
    'Proveedores de la empresa: nombre, NIF, email, teléfono y plazo de entrega habitual. Base para análisis de compras.',
    {},
    async () => {
      try {
        return ok(await apiGet('/suppliers'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'get_supplier_price_comparison',
    'Comparativa de precios de coste entre todos los proveedores para un mismo producto. Permite identificar el proveedor más competitivo y negociar mejores tarifas.',
    {
      productId: z.string().uuid().optional().describe('Filtrar para un producto concreto'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/supplier-prices/comparison', params));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    'list_promotions',
    'Promociones configuradas: condición de aplicación (cantidad mínima o importe mínimo de ticket), tipo de descuento y período de vigencia.',
    {
      active: z.boolean().optional().describe('true = solo activas, false = solo inactivas'),
    },
    async (params) => {
      try {
        return ok(await apiGet('/promotions', params));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
