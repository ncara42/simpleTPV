import type { AuthStore, AuthTokens } from './auth-store.js';

export interface ApiClient {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  // Helpers tipados de alto nivel: lanzan ApiError si la respuesta no es ok.
  get: <T>(path: string, query?: QueryParams) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  del: (path: string) => Promise<void>;
}

export type QueryParams = Record<string, string | null | undefined>;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Error ${status}`);
    this.name = 'ApiError';
  }
}

function buildPath(path: string, query?: QueryParams): string {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
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

  const jsonInit = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    async login(email, password) {
      const res = await fetch(url('/auth/login'), jsonInit({ email, password }));
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

    async get<T>(path: string, query?: QueryParams): Promise<T> {
      const res = await authedFetch(buildPath(path, query));
      if (!res.ok) {
        throw new ApiError(res.status);
      }
      return (await res.json()) as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      const res = await authedFetch(path, jsonInit(body));
      if (!res.ok) {
        throw new ApiError(res.status);
      }
      return (await res.json()) as T;
    },
    async patch<T>(path: string, body?: unknown): Promise<T> {
      const res = await authedFetch(path, { ...jsonInit(body), method: 'PATCH' });
      if (!res.ok) {
        throw new ApiError(res.status);
      }
      return (await res.json()) as T;
    },
    async del(path: string): Promise<void> {
      const res = await authedFetch(path, { method: 'DELETE' });
      if (!res.ok) {
        throw new ApiError(res.status);
      }
    },
  };
}
