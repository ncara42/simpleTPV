import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type AuthorizationCodeRecord,
  InMemoryOAuthStore,
  type RefreshTokenRecord,
} from './store.js';

const code = (expiresAt: number): AuthorizationCodeRecord => ({
  clientId: 'client-1',
  redirectUri: 'https://app.example.com/callback',
  codeChallenge: 'challenge',
  scopes: ['tpv:read'],
  resource: undefined,
  sub: 'user-1',
  organizationId: 'org-AAA',
  role: 'ADMIN',
  grantId: 'grant-1',
  expiresAt,
});

const refresh = (expiresAt: number): RefreshTokenRecord => ({
  clientId: 'client-1',
  scopes: ['tpv:read'],
  sub: 'user-1',
  organizationId: 'org-AAA',
  role: 'ADMIN',
  grantId: 'grant-1',
  expiresAt,
});

describe('InMemoryOAuthStore', () => {
  let store: InMemoryOAuthStore;
  beforeEach(() => {
    store = new InMemoryOAuthStore();
  });

  it('guarda y lee clientes', async () => {
    const client: OAuthClientInformationFull = {
      client_id: 'client-1',
      redirect_uris: ['https://app.example.com/callback'],
    };
    await store.saveClient(client);
    expect(await store.getClient('client-1')).toEqual(client);
    expect(await store.getClient('desconocido')).toBeUndefined();
  });

  it('peekCode no consume; takeCode es single-use', async () => {
    await store.saveCode('CODE', code(Date.now() + 60_000));
    expect(await store.peekCode('CODE')).toBeDefined();
    expect(await store.peekCode('CODE')).toBeDefined();
    expect(await store.takeCode('CODE')).toBeDefined();
    expect(await store.takeCode('CODE')).toBeUndefined();
  });

  it('un código caducado no se devuelve', async () => {
    await store.saveCode('OLD', code(Date.now() - 1));
    expect(await store.peekCode('OLD')).toBeUndefined();
    expect(await store.takeCode('OLD')).toBeUndefined();
  });

  it('takeRefresh consume (rotación) y revokeRefresh borra', async () => {
    await store.saveRefresh('R1', refresh(Date.now() + 60_000));
    expect(await store.takeRefresh('R1')).toBeDefined();
    expect(await store.takeRefresh('R1')).toBeUndefined();

    await store.saveRefresh('R2', refresh(Date.now() + 60_000));
    await store.revokeRefresh('R2');
    expect(await store.takeRefresh('R2')).toBeUndefined();
  });

  it('sesiones de backend: save/get/delete', async () => {
    await store.saveBackendSession('grant-1', {
      refreshCookieEnc: 'cifrado',
      organizationId: 'org-AAA',
      sub: 'user-1',
      role: 'ADMIN',
    });
    expect(await store.getBackendSession('grant-1')).toBeDefined();
    await store.deleteBackendSession('grant-1');
    expect(await store.getBackendSession('grant-1')).toBeUndefined();
  });
});
