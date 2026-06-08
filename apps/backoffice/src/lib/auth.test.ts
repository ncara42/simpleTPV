import { afterEach, describe, expect, it, vi } from 'vitest';

// IT-09 / A-02: el backoffice opera SIEMPRE contra el backend real. Ya no hay modo
// demo en el data layer ni override de login: `api.login` es siempre el login real
// de @simpletpv/auth (POST /auth/login → JWT con organizationId+role → RLS + guard).
// Esto cierra el riesgo de un panel de administración con bypass total de login.
describe('auth — login siempre real (sin bypass demo, IT-09)', () => {
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

  it('usa el login real del cliente, sin override', async () => {
    vi.resetModules();
    const realLogin = vi.fn(async () => {});
    mockAuth(realLogin);
    const { api } = await import('./auth.js');
    expect(api.login).toBe(realLogin);
  });
});
