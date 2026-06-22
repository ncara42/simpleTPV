import { describe, expect, it } from 'vitest';

import { mintAccessToken } from './tokens.js';
import { tokenVerifier } from './verifier.js';

describe('tokenVerifier (Resource Server)', () => {
  it('valida un token y expone la identidad del tenant en extra', async () => {
    const { token } = await mintAccessToken({
      sub: 'user-1',
      organizationId: 'org-AAA',
      role: 'MANAGER',
      clientId: 'client-1',
      scopes: ['tpv:read'],
      grantId: 'grant-1',
    });
    const info = await tokenVerifier.verifyAccessToken(token);
    expect(info.clientId).toBe('client-1');
    expect(info.scopes).toEqual(['tpv:read']);
    expect(info.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(info.extra?.['organizationId']).toBe('org-AAA');
    expect(info.extra?.['grantId']).toBe('grant-1');
    expect(info.extra?.['role']).toBe('MANAGER');
  });

  it('lanza con un token inválido', async () => {
    await expect(tokenVerifier.verifyAccessToken('basura')).rejects.toThrow();
  });
});
