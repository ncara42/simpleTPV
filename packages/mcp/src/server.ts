import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCatalogTools } from './tools/catalog.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerOperationsTools } from './tools/operations.js';
import { registerSalesTools } from './tools/sales.js';
import { registerStockTools } from './tools/stock.js';
import { registerUiDashboardTools } from './tools/ui-dashboard.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'simpletpv', version: '1.2.0' });
  // Tools con UI (MCP Apps) — get_company_overview se registra aquí con su recurso ui://.
  registerUiDashboardTools(server);
  registerDashboardTools(server);
  registerSalesTools(server);
  registerStockTools(server);
  registerCatalogTools(server);
  registerOperationsTools(server);
  return server;
}
