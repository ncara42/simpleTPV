import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SimpleTpvOAuthProvider } from './provider.js';
import { InMemoryOAuthStore } from './store.js';

const CLIENT: OAuthClientInformationFull = {
  client_id: 'client-1',
  redirect_uris: ['https://app.example.com/callback'],
};

describe('SimpleTpvOAuthProvider', () => {
  let store: InMemoryOAuthStore;
  let provider: SimpleTpvOAuthProvider;

  beforeEach(() => {
    store = new InMemoryOAuthStore();
    provider = new SimpleTpvOAuthProvider(store);
  });

  it('DCR: cliente público sin secreto', async () => {
    const register = provider.clientsStore.registerClient;
    if (!register) throw new Error('DCR no soportado');
    const client = await register({
      redirect_uris: ['https://app.example.com/callback'],
      token_endpoint_auth_method: 'none',
    });
    expect(client.client_id).toBeTruthy();
    expect(client.client_secret).toBeUndefined();
  });

  it('DCR: cliente confidencial con secreto', async () => {
    const register = provider.clientsStore.registerClient;
    if (!register) throw new Error('DCR no soportado');
    const client = await register({ redirect_uris: ['https://app.example.com/callback'] });
    expect(client.client_secret).toBeTruthy();
  });

  it('canjea un código por tokens y es single-use', async () => {
    await store.saveCode('CODE-1', {
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge',
      scopes: ['tpv:read'],
      resource: undefined,
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      grantId: 'grant-1',
      expiresAt: Date.now() + 60_000,
    });

    const tokens = await provider.exchangeAuthorizationCode(
      CLIENT,
      'CODE-1',
      undefined,
      'https://app.example.com/callback',
    );
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe('tpv:read');

    await expect(
      provider.exchangeAuthorizationCode(
        CLIENT,
        'CODE-1',
        undefined,
        'https://app.example.com/callback',
      ),
    ).rejects.toThrow();
  });

  it('rechaza un código de otro cliente', async () => {
    await store.saveCode('CODE-2', {
      clientId: 'OTRO',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge',
      scopes: ['tpv:read'],
      resource: undefined,
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      grantId: 'grant-1',
      expiresAt: Date.now() + 60_000,
    });
    await expect(provider.exchangeAuthorizationCode(CLIENT, 'CODE-2')).rejects.toThrow();
  });

  it('rota el refresh token (el viejo deja de valer)', async () => {
    await store.saveRefresh('REFRESH-1', {
      clientId: 'client-1',
      scopes: ['tpv:read'],
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      grantId: 'grant-1',
      expiresAt: Date.now() + 60_000,
    });

    const tokens = await provider.exchangeRefreshToken(CLIENT, 'REFRESH-1');
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.refresh_token).not.toBe('REFRESH-1');

    await expect(provider.exchangeRefreshToken(CLIENT, 'REFRESH-1')).rejects.toThrow();
  });

  it('authorize redirige a /mcp-login con los parámetros OAuth', async () => {
    const redirect = vi.fn();
    const res = { redirect } as unknown as Response;
    const params: AuthorizationParams = {
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'the-challenge',
      scopes: ['tpv:read'],
      state: 'st4te',
    };
    await provider.authorize(CLIENT, params, res);
    expect(redirect).toHaveBeenCalledOnce();
    const url = String(redirect.mock.calls[0]?.[1] ?? '');
    expect(url).toContain('/mcp-login');
    expect(url).toContain('client_id=client-1');
    expect(url).toContain('code_challenge=the-challenge');
    expect(url).toContain('state=st4te');
  });

  it('challengeForAuthorizationCode devuelve el challenge guardado', async () => {
    await store.saveCode('CODE-3', {
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'el-challenge',
      scopes: [],
      resource: undefined,
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      grantId: 'grant-1',
      expiresAt: Date.now() + 60_000,
    });
    expect(await provider.challengeForAuthorizationCode(CLIENT, 'CODE-3')).toBe('el-challenge');
  });

  it('revokeToken borra el refresh token', async () => {
    await store.saveRefresh('REFRESH-2', {
      clientId: 'client-1',
      scopes: [],
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      grantId: 'grant-1',
      expiresAt: Date.now() + 60_000,
    });
    await provider.revokeToken(CLIENT, { token: 'REFRESH-2' });
    expect(await store.takeRefresh('REFRESH-2')).toBeUndefined();
  });
});
