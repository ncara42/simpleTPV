/**
 * Puente MCP → backend SIN passthrough.
 *
 * Cada petición a una tool se ejecuta en nombre del usuario del token, pero el
 * token del cliente Claude NUNCA se reenvía al backend (lo prohíbe la spec de
 * MCP). En su lugar, usamos la sesión de backend del usuario (la cookie de
 * refresh capturada en el login) para obtener un access token de backend fresco
 * — un token DISTINTO, emitido por el backend para sí mismo. El RLS del backend
 * acota los datos a la organización del usuario.
 *
 * Cacheamos el access token por grant y refrescamos al caducar, capturando la
 * rotación de la cookie de refresh (familia SEC-06 del backend).
 */

import { decodeJwt } from 'jose';

import { getHttpConfig } from '../oauth/config.js';
import type { OAuthStore } from '../oauth/store.js';

interface CachedToken {
  token: string;
  /** Epoch ms a partir del cual se considera caducado (con margen). */
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();
const MARGIN_MS = 60 * 1000;

export class BackendSessionError extends Error {}

/**
 * Devuelve un access token de backend válido para el usuario del grant.
 * `forceRefresh` salta la caché (p. ej. tras un 401 del backend).
 */
export async function getBackendAccessToken(
  store: OAuthStore,
  grantId: string,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh) {
    const cached = cache.get(grantId);
    if (cached && Date.now() < cached.expiresAt) return cached.token;
  }

  const session = await store.getBackendSession(grantId);
  if (!session || !session.refreshCookieEnc) {
    throw new BackendSessionError('sesión de backend no encontrada; vuelve a iniciar sesión');
  }

  const { apiUrl } = getHttpConfig();
  const res = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: session.refreshCookieEnc },
  });

  if (!res.ok) {
    cache.delete(grantId);
    throw new BackendSessionError(
      'no se pudo refrescar la sesión de backend; vuelve a iniciar sesión',
    );
  }

  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new BackendSessionError('el refresh del backend no devolvió accessToken');
  }

  // El backend rota la cookie de refresh: capturamos la nueva y actualizamos.
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('refreshToken='));
  const rotated = setCookie
    ? (setCookie.split(';')[0] ?? session.refreshCookieEnc)
    : session.refreshCookieEnc;
  await store.saveBackendSession(grantId, { ...session, refreshCookieEnc: rotated });

  const claims = decodeJwt(body.accessToken);
  const expSecs = typeof claims.exp === 'number' ? claims.exp : Math.floor(Date.now() / 1000) + 900;
  cache.set(grantId, { token: body.accessToken, expiresAt: expSecs * 1000 - MARGIN_MS });

  return body.accessToken;
}

/** Limpia la caché de un grant (al revocar/cerrar sesión). */
export function clearBackendToken(grantId: string): void {
  cache.delete(grantId);
}
