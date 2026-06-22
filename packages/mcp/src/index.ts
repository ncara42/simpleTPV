import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Validar configuración al arrancar (lanza excepción si faltan vars de entorno)
import { getConfig } from './config.js';
import { registerCatalogTools } from './tools/catalog.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerOperationsTools } from './tools/operations.js';
import { registerSalesTools } from './tools/sales.js';
import { registerStockTools } from './tools/stock.js';
getConfig();

const server = new McpServer({
  name: 'simpletpv',
  version: '1.0.0',
});

registerDashboardTools(server); // 13 tools: overview, KPIs, ventas por X, márgenes, rankings
registerSalesTools(server); //  4 tools: list, detalle, Z-report, devoluciones
registerStockTools(server); //  6 tools: global, por tienda, alertas, caducidad, movimientos, reposición
registerCatalogTools(server); //  7 tools: productos, familias, tiendas, usuarios, proveedores, promociones
registerOperationsTools(server); //  6 tools: compras, traspasos, caja, fichajes, pedidos B2B, clientes

const transport = new StdioServerTransport();
await server.connect(transport);
