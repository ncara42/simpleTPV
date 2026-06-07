import { afterEach, describe, expect, it, vi } from 'vitest';

// A-02: el login del backoffice es CONDICIONAL. Por defecto (modo real) usa el
// cliente real de @simpletpv/auth (POST /auth/login); solo en demo (opt-in) lo
// sobrescribe con el JWT falso ADMIN. Antes era incondicional → bypass total de login.
describe('auth — login condicional (A-02)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('@simpletpv/auth');
  });

  function mockAuth(realLogin: () => Promise<void>) {
    vi.doMock('@simpletpv/auth', () => ({
      setupAuth: () => ({
        api: { login: realLogin, get: vi.fn(), post: vi.fn() },
        useAuthStore: { getState: () => ({ setTokens: vi.fn() }) },
      }),
    }));
  }

  it('en modo REAL (default) usa el login real, sin override', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.resetModules();
    const realLogin = vi.fn(async () => {});
    mockAuth(realLogin);
    const { api } = await import('./auth.js');
    expect(api.login).toBe(realLogin);
  });

  it('en modo DEMO (opt-in) sobrescribe el login con el JWT falso', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    vi.resetModules();
    const realLogin = vi.fn(async () => {});
    mockAuth(realLogin);
    const { api } = await import('./auth.js');
    expect(api.login).not.toBe(realLogin);
  });
});
