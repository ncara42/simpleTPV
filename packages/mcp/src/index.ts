/**
 * Punto de entrada del MCP SimpleTpv.
 *
 *  - MCP_TRANSPORT=http (default): servidor remoto multi-tenant con OAuth 2.1.
 *    Cada usuario se autentica con sus credenciales de SimpleTpv; no hay
 *    credenciales de empresa empotradas. Ver oauth/ y http/app.ts.
 *
 *  - MCP_TRANSPORT=stdio: uso local (Claude Desktop/Code). Según la spec de MCP,
 *    el transporte stdio NO usa OAuth: toma las credenciales del entorno
 *    (TPV_EMAIL/TPV_PASSWORD) vía config.ts.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { startHttpServer } from './http/app.js';
import { createMcpServer } from './server.js';

const mode = (process.env['MCP_TRANSPORT'] ?? 'http').toLowerCase();

if (mode === 'stdio') {
  // Import diferido: solo el modo stdio depende de credenciales de entorno.
  const { getConfig } = await import('./config.js');
  getConfig(); // fail-fast si faltan TPV_EMAIL/TPV_PASSWORD
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  startHttpServer();
}
