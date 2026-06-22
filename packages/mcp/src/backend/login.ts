/**
 * Login delegado al backend SimpleTpv. El paso `authorize` del OAuth valida las
 * credenciales del usuario aquí (mismas que en el TPV/backoffice), de modo que
 * NO existe un segundo almacén de identidad: el backend sigue siendo la única
 * autoridad. Capturamos también la cookie de refresh para poder renovar la
 * sesión de backend server-side (Fase 3) sin reenviar el token del cliente.
 */

import { decodeJwt } from 'jose';

import { getHttpConfig } from '../oauth/config.js';

export interface BackendLogin {
  /** Access token del backend (JWT HS256) recién emitido. */
  accessToken: string;
  /** Cookie `refreshToken=...` devuelta por el backend (httpOnly). */
  refreshCookie: string;
  /** Claims extraídas del access token del backend. */
  sub: string;
  organizationId: string;
  role: string;
}

export class BackendLoginError extends Error {}

export async function backendLogin(email: string, password: string): Promise<BackendLogin> {
  const { apiUrl } = getHttpConfig();

  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new BackendLoginError(`login backend devolvió ${res.status}`);
  }

  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new BackendLoginError('el backend no devolvió accessToken');
  }

  // El access token del backend es nuestro: lo decodificamos (sin verificar la
  // firma HS256, cuyo secreto no tenemos) para leer sub/organizationId/role.
  const claims = decodeJwt(body.accessToken);
  const organizationId =
    typeof claims['organizationId'] === 'string' ? claims['organizationId'] : '';
  const role = typeof claims['role'] === 'string' ? claims['role'] : '';
  if (!claims.sub || !organizationId) {
    throw new BackendLoginError('claims incompletas en el token del backend');
  }

  const refreshCookie = res.headers.getSetCookie().find((c) => c.startsWith('refreshToken=')) ?? '';

  return {
    accessToken: body.accessToken,
    refreshCookie,
    sub: String(claims.sub),
    organizationId,
    role,
  };
}
