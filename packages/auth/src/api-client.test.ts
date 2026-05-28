import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from './api-client.js';
import { createAuthStore } from './auth-store.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api-client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('login guarda los tokens en el store', async () => {
    const store = createAuthStore('test-auth');
    const client = createApiClient(store);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ accessToken: 'acc', refreshToken: 'ref' }),
    );

    await client.login('a@b.test', 'pw');

    expect(store.getState().accessToken).toBe('acc');
    expect(store.getState().refreshToken).toBe('ref');
    expect(store.getState().isAuthenticated()).toBe(true);
  });

  it('login con 401 lanza "Credenciales inválidas" y no guarda tokens', async () => {
    const store = createAuthStore('test-auth');
    const client = createApiClient(store);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'no' }, 401));

    await expect(client.login('a@b.test', 'bad')).rejects.toThrow('Credenciales inválidas');
    expect(store.getState().isAuthenticated()).toBe(false);
  });

  it('fetch añade el Bearer del accessToken', async () => {
    const store = createAuthStore('test-auth');
    store.getState().setTokens({ accessToken: 'acc', refreshToken: 'ref' });
    const client = createApiClient(store);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));

    await client.fetch('/products');

    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer acc');
  });

  it('ante 401 refresca el token y reintenta la petición', async () => {
    const store = createAuthStore('test-auth');
    store.getState().setTokens({ accessToken: 'old', refreshToken: 'ref' });
    const client = createApiClient(store);

    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401)) // 1ª: protegida → 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new' })) // 2ª: refresh OK
      .mockResolvedValueOnce(jsonResponse({ data: 1 })); // 3ª: reintento OK

    const res = await client.fetch('/products');

    expect(res.status).toBe(200);
    expect(store.getState().accessToken).toBe('new');
    // 3 llamadas: original, refresh, reintento
    expect(spy).toHaveBeenCalledTimes(3);
    const retryInit = spy.mock.calls[2]![1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('si el refresh falla, limpia la sesión', async () => {
    const store = createAuthStore('test-auth');
    store.getState().setTokens({ accessToken: 'old', refreshToken: 'ref' });
    const client = createApiClient(store);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'bad refresh' }, 401));

    await client.fetch('/products');

    expect(store.getState().isAuthenticated()).toBe(false);
  });
});
