import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { getConfig } from './config.js';
import { startHttpServer } from './http.js';
import { createMcpServer } from './server.js';

// Fail-fast on missing credentials before accepting any connections
getConfig();

const mode = (process.env['MCP_TRANSPORT'] ?? 'http').toLowerCase();

if (mode === 'stdio') {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  startHttpServer();
}
