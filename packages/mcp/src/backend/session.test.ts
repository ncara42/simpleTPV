import { afterEach, describe, expect, it, vi } from 'vitest';

import { encryptSecret } from '../oauth/crypto.js';
import type { OAuthStore } from '../oauth/store.js';
import { getBackendAccessToken } from './session.js';

/**
 * Regresión del bug que dejaba la sesión del MCP inservible: el refresh token del
 * backend es de un solo uso con rotación de familia (SEC-06). Si varias llamadas
 * concurrentes (p. ej. el `Promise.all` de get_company_overview) refrescaban con
 * el MISMO token a la vez, el backend revocaba la familia → todo 401. El fix es un
 * single-flight por grant: las llamadas concurrentes comparten UN solo refresh.
 */

// JWT bien formado (decodeJwt solo decodifica el payload, no verifica firma).
const farFuture = 9999999999;
const payload = Buffer.from(JSON.stringify({ exp: farFuture })).toString('base64url');
const FAKE_ACCESS = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;

function makeStore(): OAuthStore {
  const stub = {
    getBackendSession: vi.fn(async () => ({
      refreshCookieEnc: encryptSecret('refreshToken=r1'),
      organizationId: 'org-1',
      sub: 'user-1',
      role: 'ADMIN',
    })),
    saveBackendSession: vi.fn(async () => {}),
  };
  return stub as unknown as OAuthStore;
}

function mockRefreshOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ accessToken: FAKE_ACCESS }),
    headers: { getSetCookie: () => ['refreshToken=r2; HttpOnly; Secure'] },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getBackendAccessToken — single-flight', () => {
  it('colapsa N refrescos concurrentes en UNA sola llamada a /auth/refresh', async () => {
    const fetchMock = mockRefreshOk();
    const store = makeStore();

    // 6 llamadas concurrentes para el mismo grant (como el Promise.all de las tools).
    const tokens = await Promise.all(
      Array.from({ length: 6 }, () => getBackendAccessToken(store, 'grant-concurrent')),
    );

    // El refresh token de un solo uso se consume UNA vez, no seis.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokens).toHaveLength(6);
    expect(new Set(tokens)).toEqual(new Set([FAKE_ACCESS]));
  });

  it('tras un refresh, las llamadas siguientes usan la caché (sin nuevo /auth/refresh)', async () => {
    const fetchMock = mockRefreshOk();
    const store = makeStore();

    await getBackendAccessToken(store, 'grant-cache');
    await getBackendAccessToken(store, 'grant-cache');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
