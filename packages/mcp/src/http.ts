import { randomUUID } from 'node:crypto';
import http from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer } from './server.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

const sessions = new Map<string, StreamableHTTPServerTransport>();

export function startHttpServer(): void {
  const port = parseInt(process.env['MCP_PORT'] ?? '8766', 10);
  const apiKey = process.env['MCP_API_KEY'];

  const server = http.createServer((req, res) => {
    handle(req, res, apiKey).catch((err: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
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
    } else {
      console.error('Auth: disabled — set MCP_API_KEY to require authentication');
    }
  });
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string | undefined,
): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Route guard
  const url = req.url?.split('?')[0];
  if (url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
    return;
  }

  // API key auth
  if (apiKey) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${apiKey}`) {
      res.writeHead(401, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(
        JSON.stringify({ error: 'Unauthorized — include Authorization: Bearer <MCP_API_KEY>' }),
      );
      return;
    }
  }

  // Parse JSON body for POST requests
  let body: unknown;
  if (req.method === 'POST') {
    const raw = await readBody(req);
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
  }

  // Route to existing session or start a new one
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string') {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
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
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
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
