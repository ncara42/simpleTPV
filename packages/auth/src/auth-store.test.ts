import { describe, expect, it } from 'vitest';

import { createAuthStore } from './auth-store.js';

// Construye un JWT de juguete (header.payload.signature) con el payload dado.
// Solo importa el segmento del payload: decodeRole no verifica la firma.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown): string =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('auth-store getRole', () => {
  it('devuelve null sin sesión', () => {
    const store = createAuthStore('test-none');
    expect(store.getState().getRole()).toBeNull();
  });

  it('extrae el role ADMIN del access token', () => {
    const store = createAuthStore('test-admin');
    store.getState().setTokens({
      accessToken: fakeJwt({ sub: 'u1', organizationId: 'o1', role: 'ADMIN' }),
    });
    expect(store.getState().getRole()).toBe('ADMIN');
  });

  it('extrae un role no-admin', () => {
    const store = createAuthStore('test-clerk');
    store.getState().setTokens({
      accessToken: fakeJwt({ sub: 'u2', organizationId: 'o1', role: 'CLERK' }),
    });
    expect(store.getState().getRole()).toBe('CLERK');
  });

  it('devuelve null ante un token malformado', () => {
    const store = createAuthStore('test-bad');
    store.getState().setTokens({ accessToken: 'no-es-un-jwt' });
    expect(store.getState().getRole()).toBeNull();
  });
});
