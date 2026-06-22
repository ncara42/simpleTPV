import { AsyncLocalStorage } from 'node:async_hooks';

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { getToken, invalidate } from './auth.js';
import { getConfig } from './config.js';

/**
 * Contexto de autenticación por petición (modo http/OAuth). Lo establece el
 * handler de /mcp con el grant del usuario; las tools lo leen de forma
 * transparente vía AsyncLocalStorage, sin recibir parámetros extra.
 */
export interface BackendAuthContext {
  apiUrl: string;
  /** Resuelve un access token de backend del usuario (sin passthrough). */
  getBackendToken(forceRefresh?: boolean): Promise<string>;
}

const authContext = new AsyncLocalStorage<BackendAuthContext>();

/** Ejecuta `fn` con el contexto de backend del usuario activo. */
export function runWithBackendAuth<T>(ctx: BackendAuthContext, fn: () => Promise<T>): Promise<T> {
  return authContext.run(ctx, fn);
}

function buildQs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function doFetch(url: string, token: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

export async function apiGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const ctx = authContext.getStore();

  // Modo http/OAuth: token de backend DEL USUARIO (sin passthrough del token MCP).
  if (ctx) {
    const url = `${ctx.apiUrl}${path}${buildQs(params)}`;
    let res = await doFetch(url, await ctx.getBackendToken());
    if (res.status === 401) {
      res = await doFetch(url, await ctx.getBackendToken(true));
    }
    if (!res.ok) {
      throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  // Modo stdio: credenciales del entorno (login global de admin/manager).
  const { apiUrl } = getConfig();
  const url = `${apiUrl}${path}${buildQs(params)}`;
  let token = await getToken();
  let res = await doFetch(url, token);
  if (res.status === 401) {
    invalidate();
    token = await getToken();
    res = await doFetch(url, token);
  }
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function ok(data: unknown): CallToolResult {
  // JSON compacto (sin indentación): recorta ~25-40% de tokens en respuestas
  // grandes que el modelo tiene que re-ingerir, sin perder información.
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/**
 * Envuelve una llamada de las tools COMPUESTAS para que un sub-endpoint que falle
 * (p. ej. un 404 puntual) no tumbe toda la respuesta: devuelve `{ error: msg }` en
 * lugar de propagar. Así una pregunta como "analízame las ventas" sigue devolviendo
 * el resto de cortes aunque uno concreto no esté disponible.
 */
export function safe<T>(p: Promise<T>): Promise<T | { error: string }> {
  return p.catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
}

export function fail(e: unknown): CallToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}
