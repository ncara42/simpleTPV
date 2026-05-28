import { describe, expect, it } from 'vitest';

import { AuthController } from './auth.controller.js';
import type { AuthService, AuthUser } from './auth.service.js';

const USER: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'admin@org1.test',
  name: 'Admin',
  passwordHash: 'x',
  role: 'ADMIN',
  active: true,
};

function makeController(opts: { valid?: boolean }): AuthController {
  const service = {
    validateUser: async (_email: string, _pw: string) => (opts.valid ? USER : null),
    login: async (_u: AuthUser) => ({ accessToken: 'acc', refreshToken: 'ref' }),
    refresh: async (_t: string) => ({ accessToken: 'acc2' }),
  } as unknown as AuthService;
  return new AuthController(service);
}

describe('AuthController', () => {
  it('POST /auth/login con credenciales válidas devuelve tokens', async () => {
    const ctrl = makeController({ valid: true });
    const res = await ctrl.login({ email: 'admin@org1.test', password: 'password123' });
    expect(res.accessToken).toBe('acc');
    expect(res.refreshToken).toBe('ref');
  });

  it('POST /auth/login con credenciales inválidas lanza 401', async () => {
    const ctrl = makeController({ valid: false });
    await expect(ctrl.login({ email: 'x@x.test', password: 'bad' })).rejects.toThrow();
  });

  it('POST /auth/refresh devuelve nuevo accessToken', async () => {
    const ctrl = makeController({ valid: true });
    const res = await ctrl.refresh({ refreshToken: 'ref' });
    expect(res.accessToken).toBe('acc2');
  });

  it('GET /auth/me devuelve el usuario del request', () => {
    const ctrl = makeController({ valid: true });
    const req = { user: { sub: 'user-1', organizationId: 'org-1', role: 'ADMIN' } };
    const me = ctrl.me(req as never);
    expect(me.sub).toBe('user-1');
    expect(me.organizationId).toBe('org-1');
  });
});
