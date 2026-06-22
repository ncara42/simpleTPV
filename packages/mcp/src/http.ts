import { randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer } from './server.js';

// ─── Límites de recursos ─────────────────────────────────────────────────────
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — evita DoS por body gigante
const MAX_SESSIONS = 100; // cap de sesiones simultáneas
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min de inactividad → evict

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Lista blanca configurable vía MCP_ALLOWED_ORIGINS (CSV).
// Sin lista: wildcard '*' (solo aceptable si no hay API key).
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
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  base['Vary'] = 'Origin';
  return base;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Comparación constant-time para evitar timing attacks.
function verifyApiKey(authHeader: string | undefined, apiKey: string): boolean {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const provided = Buffer.from(String(authHeader ?? ''));
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ─── Host validation (DNS rebinding) ─────────────────────────────────────────
const BIND_HOST = process.env['MCP_BIND'] ?? '127.0.0.1';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

function isValidHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = (host.split(':')[0] ?? '').toLowerCase();
  if (LOOPBACK.has(BIND_HOST)) {
    return LOOPBACK.has(hostname);
  }
  const publicHost = process.env['MCP_PUBLIC_HOST'];
  if (publicHost) return hostname === publicHost.toLowerCase();
  return true; // bind público sin MCP_PUBLIC_HOST → no se puede validar
}

// ─── Sesiones con estado ──────────────────────────────────────────────────────
interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastUsed: number;
}

const sessions = new Map<string, SessionEntry>();

// Evicta sesiones inactivas cada 5 min; .unref() no bloquea el cierre del proceso.
setInterval(
  () => {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (now - entry.lastUsed > SESSION_TTL_MS) {
        void entry.transport.close();
        sessions.delete(id);
      }
    }
  },
  5 * 60 * 1000,
).unref();

// ─── Arranque ─────────────────────────────────────────────────────────────────
export function startHttpServer(): void {
  const port = parseInt(process.env['MCP_PORT'] ?? '8766', 10);
  const apiKey = process.env['MCP_API_KEY'];

  // Fail-fast: igual que TPV_EMAIL/TPV_PASSWORD en config.ts.
  // El servidor HTTP expone datos de empresa — la clave no es opcional.
  if (!apiKey) {
    throw new Error(
      'MCP_API_KEY env var is required for HTTP transport. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }

  if (ALLOWED_ORIGINS.length === 0) {
    console.error(
      'WARN: MCP_ALLOWED_ORIGINS not set — any browser origin can use the API key. ' +
        'Recommended: MCP_ALLOWED_ORIGINS=https://claude.ai',
    );
  }
  if (!LOOPBACK.has(BIND_HOST)) {
    console.error(
      'WARN: bound to non-loopback interface — ensure TLS is terminated by a ' +
        'reverse proxy (nginx/caddy) before exposing to the internet.',
    );
    if (!process.env['MCP_PUBLIC_HOST']) {
      console.error('WARN: set MCP_PUBLIC_HOST=<tu-dominio> to enable Host header validation.');
    }
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

  server.requestTimeout = 30_000; // 30 s — evita conexiones zombie

  server.listen(port, BIND_HOST, () => {
    console.error(`SimpleTpv MCP → http://${BIND_HOST}:${port}/mcp`);
    console.error('Auth: Bearer token required');
    if (ALLOWED_ORIGINS.length > 0) {
      console.error(`CORS: allowed origins → ${ALLOWED_ORIGINS.join(', ')}`);
    }
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string,
): Promise<void> {
  const cors = corsHeaders(req.headers['origin']);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // Host header validation — mitigación de DNS rebinding
  if (!isValidHost(req.headers['host'])) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ error: 'Bad Request: invalid Host header' }));
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
  if (!verifyApiKey(req.headers['authorization'], apiKey)) {
    res.writeHead(401, { 'Content-Type': 'application/json', ...cors });
    res.end(
      JSON.stringify({ error: 'Unauthorized — include Authorization: Bearer <MCP_API_KEY>' }),
    );
    return;
  }

  // Rechazar cuerpos excesivos antes de leer (Content-Length conocido)
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    res.writeHead(413, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ error: 'Request body too large (max 1 MiB)' }));
    return;
  }

  // Leer y parsear body con límite estricto
  let body: unknown;
  if (req.method === 'POST') {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: 'Request body too large (max 1 MiB)' }));
      return;
    }
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
  }

  // Reutilizar sesión existente
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string') {
    const entry = sessions.get(sessionId);
    if (!entry) {
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
    entry.lastUsed = Date.now(); // actualizar TTL
    await entry.transport.handleRequest(req, res, body);
    return;
  }

  // Sin session ID: debe ser un initialize request
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

  // Cap de sesiones — evita agotamiento de memoria
  if (sessions.size >= MAX_SESSIONS) {
    res.writeHead(503, { 'Content-Type': 'application/json', ...cors });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Server at session capacity — try again later' },
        id: null,
      }),
    );
    return;
  }

  // Nueva sesión
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, lastUsed: Date.now() });
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
