import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { DESIGN_SYSTEM_INSTRUCTIONS } from './design-system.js';
import { registerCatalogTools } from './tools/catalog.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerDashboardComposites } from './tools/dashboard-composite.js';
import { registerOperationsTools } from './tools/operations.js';
import { registerSalesTools } from './tools/sales.js';
import { registerStockTools } from './tools/stock.js';

export function createMcpServer(): McpServer {
  // `instructions` viaja en el `initialize` del MCP y el host (claude.ai / Claude
  // Desktop) lo inyecta en el contexto del modelo. Lo usamos como CONTRATO DE
  // DISEÑO: el modelo sigue componiendo la UI (su forma de montar), pero la viste
  // con la identidad visual de SimpleTPV (tokens de `theme.css`). Ver design-system.ts.
  const server = new McpServer(
    { name: 'simpletpv', version: '1.2.0' },
    { instructions: DESIGN_SYSTEM_INSTRUCTIONS },
  );
  // Compuestas del dashboard (overview + breakdown): solo datos, sin panel UI; la
  // piel la aporta el contrato de diseño de arriba, no un iframe.
  registerDashboardComposites(server);
  registerDashboardTools(server);
  registerSalesTools(server);
  registerStockTools(server);
  registerCatalogTools(server);
  registerOperationsTools(server);
  return server;
}
