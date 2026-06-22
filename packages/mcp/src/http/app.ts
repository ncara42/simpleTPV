/**
 * Servidor HTTP del MCP (OAuth 2.1). Un solo despliegue multi-tenant que actúa
 * como Authorization Server y Resource Server, con el cableado oficial del SDK:
 *
 *  - mcpAuthRouter        → /authorize /token /register (DCR) /revoke + metadata
 *                           del AS (RFC 8414) y del recurso protegido (RFC 9728).
 *  - requireBearerAuth    → valida el Bearer en /mcp y emite el WWW-Authenticate
 *                           conforme a RFC 9728 en los 401.
 *  - StreamableHTTP       → transporte MCP con sesiones, detrás de la auth.
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import express, { type Request, type Response } from 'express';

import { getHttpConfig } from '../oauth/config.js';
import { SimpleTpvOAuthProvider } from '../oauth/provider.js';
import { InMemoryOAuthStore } from '../oauth/store.js';
import { tokenVerifier } from '../oauth/verifier.js';
import { createMcpServer } from '../server.js';

const MAX_BODY = '1mb';
const MAX_SESSIONS = 200;
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Scopes que ofrece el servidor; least-privilege se refina en Fase 3. */
const SCOPES_SUPPORTED = ['tpv:read'];

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastUsed: number;
}
const sessions = new Map<string, SessionEntry>();

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

export function startHttpServer(): void {
  const cfg = getHttpConfig();
  const store = new InMemoryOAuthStore();
  const provider = new SimpleTpvOAuthProvider(store);

  const app = express();
  app.disable('x-powered-by');

  // CORS: lista blanca si está configurada; si no, refleja el origen (los
  // tokens son por usuario, no un secreto compartido).
  app.use(
    cors({
      origin: cfg.allowedOrigins.length > 0 ? cfg.allowedOrigins : true,
      exposedHeaders: ['mcp-session-id', 'WWW-Authenticate'],
      allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'mcp-protocol-version'],
    }),
  );

  // Endpoints OAuth del AS + metadata del recurso protegido. Debe ir en la raíz.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: cfg.issuerUrl,
      baseUrl: cfg.issuerUrl,
      resourceServerUrl: cfg.resourceUrl,
      scopesSupported: SCOPES_SUPPORTED,
      resourceName: 'SimpleTpv',
    }),
  );

  const requireAuth = requireBearerAuth({
    verifier: tokenVerifier,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(cfg.resourceUrl),
  });

  const handleMcp = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'];

    if (typeof sessionId === 'string') {
      const entry = sessions.get(sessionId);
      if (!entry) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Sesión no encontrada o expirada' },
          id: null,
        });
        return;
      }
      entry.lastUsed = Date.now();
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    // Sin sesión: solo se admite un initialize que abre una nueva.
    if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Envía un initialize para abrir sesión' },
        id: null,
      });
      return;
    }

    if (sessions.size >= MAX_SESSIONS) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Servidor al límite de sesiones; reinténtalo' },
        id: null,
      });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, lastUsed: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const server: McpServer = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

  const jsonBody = express.json({ limit: MAX_BODY });
  app.post('/mcp', requireAuth, jsonBody, (req, res) => {
    void handleMcp(req, res);
  });
  app.get('/mcp', requireAuth, (req, res) => {
    void handleMcp(req, res);
  });
  app.delete('/mcp', requireAuth, (req, res) => {
    void handleMcp(req, res);
  });

  const server = http.createServer(app);
  server.requestTimeout = 30_000;
  server.listen(cfg.port, cfg.bindHost, () => {
    console.error(`SimpleTpv MCP (OAuth 2.1) → ${cfg.resourceUrl.href}`);
    console.error(`  Issuer: ${cfg.issuerUrl.href}`);
    console.error(`  PRM:    ${getOAuthProtectedResourceMetadataUrl(cfg.resourceUrl)}`);
    if (cfg.allowedOrigins.length > 0) {
      console.error(`  CORS:   ${cfg.allowedOrigins.join(', ')}`);
    }
  });
}
