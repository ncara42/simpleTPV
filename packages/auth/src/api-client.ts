import type { AuthStore, AuthTokens } from './auth-store.js';

export interface ApiClient {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// Cliente API ligado a un authStore. `fetch` añade el Bearer y, ante un 401,
// intenta UN refresh con el refreshToken; si funciona, reintenta la petición
// original; si falla, limpia la sesión.
export function createApiClient(store: AuthStore, baseUrl = '/api'): ApiClient {
  const url = (path: string): string => `${baseUrl}${path}`;

  async function tryRefresh(): Promise<boolean> {
    const { refreshToken, setAccessToken, clear } = store.getState();
    if (!refreshToken) {
      return false;
    }
    const res = await fetch(url('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    const { accessToken } = (await res.json()) as { accessToken: string };
    setAccessToken(accessToken);
    return true;
  }

  async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const withAuth = (token: string | null): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    let res = await fetch(url(path), withAuth(store.getState().accessToken));
    if (res.status === 401 && (await tryRefresh())) {
      res = await fetch(url(path), withAuth(store.getState().accessToken));
    }
    return res;
  }

  return {
    async login(email, password) {
      const res = await fetch(url('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const msg = res.status === 401 ? 'Credenciales inválidas' : `Error ${res.status}`;
        throw new Error(msg);
      }
      const tokens = (await res.json()) as LoginResponse;
      store.getState().setTokens(tokens satisfies AuthTokens);
    },
    logout() {
      store.getState().clear();
    },
    fetch: authedFetch,
  };
}
