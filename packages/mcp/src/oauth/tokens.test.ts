import { describe, expect, it } from 'vitest';

import { mintAccessToken, verifyAccessToken } from './tokens.js';

describe('access tokens del MCP (ES256)', () => {
  it('firma y verifica preservando las claims del tenant', async () => {
    const { token, expiresInSecs } = await mintAccessToken({
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'ADMIN',
      clientId: 'client-1',
      scopes: ['tpv:read'],
      grantId: 'grant-1',
    });
    expect(expiresInSecs).toBeGreaterThan(0);

    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.organizationId).toBe('org-AAA');
    expect(claims.role).toBe('ADMIN');
    expect(claims.clientId).toBe('client-1');
    expect(claims.grantId).toBe('grant-1');
    expect(claims.scopes).toEqual(['tpv:read']);
    expect(claims.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rechaza un token con firma/forma inválida', async () => {
    await expect(verifyAccessToken('no.es.un.jwt')).rejects.toThrow();
  });
});
