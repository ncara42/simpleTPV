import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCatalogTools } from './tools/catalog.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerDashboardComposites } from './tools/dashboard-composite.js';
import { registerOperationsTools } from './tools/operations.js';
import { registerSalesTools } from './tools/sales.js';
import { registerStockTools } from './tools/stock.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'simpletpv', version: '1.2.0' });
  // Compuestas del dashboard (overview + breakdown): solo datos, sin panel UI.
  registerDashboardComposites(server);
  registerDashboardTools(server);
  registerSalesTools(server);
  registerStockTools(server);
  registerCatalogTools(server);
  registerOperationsTools(server);
  return server;
}
