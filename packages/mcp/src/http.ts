import { randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer } from './server.js';

// Orígenes permitidos: lista blanca configurable vía MCP_ALLOWED_ORIGINS (CSV).
// Si no se define, se devuelve '*' solo cuando no hay API key — en ese caso
// el origen no aporta seguridad adicional. Con API key sin allowlist se advierte.
const ALLOWED_ORIGINS: string[] = (process.env['MCP_ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | undefined): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
    'Access-Control-Expose-Headers': 'mcp-session-id',
  };

  if (ALLOWED_ORIGINS.length === 0) {
    base['Access-Control-Allow-Origin'] = '*';
    return base;
  }

  // Reflect origin only if it is in the allowlist; otherwise deny cross-origin.
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  base['Vary'] = 'Origin';
  return base;
}

// Constant-time bearer token comparison to mitigate timing attacks.
function verifyApiKey(authHeader: string | undefined, apiKey: string): boolean {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const provided = Buffer.from(String(authHeader ?? ''));
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

const sessions = new Map<string, StreamableHTTPServerTransport>();

export function startHttpServer(): void {
  const port = parseInt(process.env['MCP_PORT'] ?? '8766', 10);
  const apiKey = process.env['MCP_API_KEY'];

  if (!apiKey) {
    console.error('WARN: MCP_API_KEY is not set — endpoint is unauthenticated');
  }
  if (apiKey && ALLOWED_ORIGINS.length === 0) {
    console.error(
      'WARN: MCP_API_KEY is set but MCP_ALLOWED_ORIGINS is not — browser clients from any origin can use the key; set MCP_ALLOWED_ORIGINS to restrict',
    );
  }

  const server = http.createServer((req, res) => {
    handle(req, res, apiKey).catch((err: unknown) => {
      const cors = corsHeaders(req.headers['origin']);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: String(err) },
            id: null,
          }),
        );
      }
    });
  });

  server.listen(port, () => {
    console.error(`SimpleTpv MCP → http://0.0.0.0:${port}/mcp`);
    if (apiKey) {
      console.error('Auth: Bearer token required (MCP_API_KEY is set)');
    }
    if (ALLOWED_ORIGINS.length > 0) {
      console.error(`CORS: allowed origins → ${ALLOWED_ORIGINS.join(', ')}`);
    }
  });
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string | undefined,
): Promise<void> {
  const cors = corsHeaders(req.headers['origin']);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // Route guard
  const url = req.url?.split('?')[0];
  if (url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
    return;
  }

  // Constant-time API key check
  if (apiKey && !verifyApiKey(req.headers['authorization'], apiKey)) {
    res.writeHead(401, { 'Content-Type': 'application/json', ...cors });
    res.end(
      JSON.stringify({ error: 'Unauthorized — include Authorization: Bearer <MCP_API_KEY>' }),
    );
    return;
  }

  // Parse JSON body for POST requests
  let body: unknown;
  if (req.method === 'POST') {
    const raw = await readBody(req);
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
  }

  // Route to existing session or start a new one
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string') {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session not found or expired' },
          id: null,
        }),
      );
      return;
    }
    await transport.handleRequest(req, res, body);
    return;
  }

  // No session ID: must be an initialize request to start a new session
  if (req.method !== 'POST' || !isInitializeRequest(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Send an initialize request to start a session' },
        id: null,
      }),
    );
    return;
  }

  // New session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
