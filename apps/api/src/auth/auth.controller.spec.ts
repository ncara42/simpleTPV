import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import type { AuthService, AuthUser } from './auth.service.js';

const USER: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'admin@org1.test',
  name: 'Admin',
  passwordHash: 'x',
  pinHash: null,
  role: 'ADMIN',
  active: true,
  createdAt: new Date(),
};

function makeController(opts: { valid?: boolean }): AuthController {
  const service = {
    validateUser: async (_email: string, _pw: string) => (opts.valid ? USER : null),
    login: async (_u: AuthUser) => ({ accessToken: 'acc', refreshToken: 'ref' }),
    refresh: async (_t: string) => ({ accessToken: 'acc2', refreshToken: 'ref2' }),
    logout: async (_t: string | null | undefined) => undefined,
  } as unknown as AuthService;
  return new AuthController(service);
}

// Mock mínimo del Response de Express: captura cookie()/clearCookie().
function makeRes(): {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
} {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('AuthController', () => {
  it('POST /auth/login devuelve solo el accessToken y fija el refresh en una cookie httpOnly', async () => {
    const ctrl = makeController({ valid: true });
    const res = makeRes();
    const body = (await ctrl.login(
      { email: 'admin@org1.test', password: 'password123' },
      '127.0.0.1',
      res as never,
    )) as { accessToken: string; refreshToken?: string };

    expect(body.accessToken).toBe('acc');
    // El refresh NO viaja en el body (SEC-20): solo en la cookie.
    expect(body.refreshToken).toBeUndefined();
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'ref',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
      }),
    );
  });

  it('POST /auth/login con credenciales inválidas lanza 401', async () => {
    const ctrl = makeController({ valid: false });
    const res = makeRes();
    await expect(
      ctrl.login({ email: 'x@x.test', password: 'bad' }, '127.0.0.1', res as never),
    ).rejects.toThrow();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('POST /auth/refresh lee la cookie, rota y devuelve un nuevo accessToken', async () => {
    const ctrl = makeController({ valid: true });
    const res = makeRes();
    const req = { headers: { cookie: 'refreshToken=ref' } };
    const body = await ctrl.refresh(req as never, '127.0.0.1', res as never);

    expect(body.accessToken).toBe('acc2');
    // Rota la cookie con el refresh nuevo.
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'ref2', expect.anything());
  });

  it('POST /auth/refresh sin cookie válida limpia la cookie y propaga el error', async () => {
    const service = {
      refresh: async () => {
        throw new Error('Sesión no válida');
      },
    } as unknown as AuthService;
    const ctrl = new AuthController(service);
    const res = makeRes();
    await expect(
      ctrl.refresh({ headers: {} } as never, '127.0.0.1', res as never),
    ).rejects.toThrow();
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
  });

  it('POST /auth/logout limpia la cookie del refresh', async () => {
    const ctrl = makeController({ valid: true });
    const res = makeRes();
    await ctrl.logout({ headers: { cookie: 'refreshToken=ref' } } as never, res as never);
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
  });

  // AUTH-04: /auth/refresh debe tener un throttle dedicado más estricto que el global
  // (120/min), igual de espíritu que el de /login, para dificultar el abuso de la
  // rotación de sesión. @Throttle({ default: { limit, ttl } }) deja la metadata
  // 'THROTTLER:LIMITdefault' / 'THROTTLER:TTLdefault' sobre el método.
  it('POST /auth/refresh declara un @Throttle dedicado (10/min)', () => {
    const refresh = AuthController.prototype.refresh;
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', refresh) as unknown;
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', refresh) as unknown;
    expect(limit).toBe(10);
    expect(ttl).toBe(60000);
  });

  it('GET /auth/me devuelve el usuario del request', () => {
    const ctrl = makeController({ valid: true });
    const req = { user: { sub: 'user-1', organizationId: 'org-1', role: 'ADMIN' } };
    const me = ctrl.me(req as never);
    expect(me.sub).toBe('user-1');
    expect(me.organizationId).toBe('org-1');
  });
});
