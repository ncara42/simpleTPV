import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCatalogTools } from './tools/catalog.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerOperationsTools } from './tools/operations.js';
import { registerSalesTools } from './tools/sales.js';
import { registerStockTools } from './tools/stock.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'simpletpv', version: '1.0.0' });
  registerDashboardTools(server);
  registerSalesTools(server);
  registerStockTools(server);
  registerCatalogTools(server);
  registerOperationsTools(server);
  return server;
}
