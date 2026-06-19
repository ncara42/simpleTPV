import type { AppEvent } from './api-types.js';
import type { AuthStore, AuthTokens } from './auth-store.js';

export interface ApiClient {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  // Suscripción al stream SSE de /events. Devuelve una función para cerrar la
  // conexión. onEvent recibe cada AppEvent (ignora los heartbeats `ping`).
  subscribeEvents: (onEvent: (event: AppEvent) => void) => () => void;
  // POST SSE de un único turno (chat). Parsea el stream y entrega cada evento.
  postStream: (
    path: string,
    body: unknown,
    onEvent: (eventType: string, data: unknown) => void,
    signal?: AbortSignal,
  ) => Promise<void>;
  // Helpers tipados de alto nivel: lanzan ApiError si la respuesta no es ok.
  get: <T>(path: string, query?: QueryParams) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  del: (path: string) => Promise<void>;
}

export type QueryParams = Record<string, string | null | undefined>;

export class ApiError extends Error {
  // `body` es el mensaje legible que devuelve la API (p.ej. el límite de rol en
  // un 403). Si la respuesta no trae cuerpo útil, queda undefined y el consumidor
  // usa un mensaje genérico.
  constructor(
    readonly status: number,
    readonly body?: string,
  ) {
    super(body ?? `Error ${status}`);
    this.name = 'ApiError';
  }
}

// Extrae el mensaje de error de una respuesta no-ok de NestJS. El formato típico
// es { message: string | string[], ... }. Devuelve undefined si no hay cuerpo.
async function readErrorBody(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.clone().json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(', ');
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
  } catch {
    // Cuerpo no-JSON o vacío: caemos al mensaje genérico.
  }
  return undefined;
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
}

// Cliente API ligado a un authStore. `fetch` añade el Bearer y, ante un 401,
// intenta UN refresh; si funciona, reintenta la petición original; si falla,
// limpia la sesión. El refresh token NO vive en el cliente (SEC-20): viaja en una
// cookie httpOnly que el navegador envía con `credentials: 'include'`.
export function createApiClient(store: AuthStore, baseUrl = '/api'): ApiClient {
  const url = (path: string): string => `${baseUrl}${path}`;

  async function tryRefresh(): Promise<boolean> {
    const { setAccessToken, clear } = store.getState();
    // Sin body: el refresh token va en la cookie httpOnly (credentials:include).
    const res = await fetch(url('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
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

  // Parsea el body JSON tolerando respuestas sin contenido (204 o body vacío):
  // endpoints como PUT /users/:id/stores responden 204 y `res.json()` lanzaría
  // "Unexpected end of JSON input". En esos casos devuelve undefined (el caller
  // tipa Promise<void>).
  async function parseJson<T>(res: Response): Promise<T> {
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }

  async function parseSseStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (eventType: string, data: unknown) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let eventType = 'message';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (eventType === 'ping' || dataLines.length === 0) continue;
        try {
          const data = JSON.parse(dataLines.join('\n')) as unknown;
          onEvent(eventType, data);
        } catch {
          // bloque malformado — ignorar
        }
      }
    }
  }

  return {
    async login(email, password) {
      // credentials:include para que el navegador almacene la cookie httpOnly del
      // refresh token que devuelve la API (SEC-20).
      const res = await fetch(url('/auth/login'), {
        ...jsonInit({ email, password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = res.status === 401 ? 'Credenciales inválidas' : `Error ${res.status}`;
        throw new Error(msg);
      }
      const tokens = (await res.json()) as LoginResponse;
      store.getState().setTokens(tokens satisfies AuthTokens);
    },
    logout() {
      // Revoca la sesión server-side y limpia la cookie (best-effort), luego borra
      // el estado local. La cookie httpOnly solo la puede limpiar el servidor.
      void fetch(url('/auth/logout'), { method: 'POST', credentials: 'include' }).catch(
        () => undefined,
      );
      store.getState().clear();
    },
    fetch: authedFetch,

    async get<T>(path: string, query?: QueryParams): Promise<T> {
      const res = await authedFetch(buildPath(path, query));
      if (!res.ok) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
      return parseJson<T>(res);
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      const res = await authedFetch(path, jsonInit(body));
      if (!res.ok) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
      return parseJson<T>(res);
    },
    async put<T>(path: string, body?: unknown): Promise<T> {
      const res = await authedFetch(path, { ...jsonInit(body), method: 'PUT' });
      if (!res.ok) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
      return parseJson<T>(res);
    },
    async patch<T>(path: string, body?: unknown): Promise<T> {
      const res = await authedFetch(path, { ...jsonInit(body), method: 'PATCH' });
      if (!res.ok) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
      return parseJson<T>(res);
    },
    async del(path: string): Promise<void> {
      const res = await authedFetch(path, { method: 'DELETE' });
      if (!res.ok) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
    },

    async postStream(path, body, onEvent, signal) {
      await tryRefresh();
      const token = store.getState().accessToken;
      const sig = signal ?? null;
      const res = await fetch(url(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: sig,
      });
      if (res.status === 401) {
        if (await tryRefresh()) {
          const token2 = store.getState().accessToken;
          const res2 = await fetch(url(path), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(token2 ? { Authorization: `Bearer ${token2}` } : {}),
            },
            body: JSON.stringify(body),
            signal: sig,
          });
          if (!res2.ok || !res2.body) {
            throw new ApiError(res2.status, await readErrorBody(res2));
          }
          return parseSseStream(res2.body, onEvent);
        }
        throw new ApiError(401, await readErrorBody(res));
      }
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, await readErrorBody(res));
      }
      return parseSseStream(res.body, onEvent);
    },

    // SSE sobre fetch (el EventSource nativo no permite la cabecera Authorization).
    // Lee el stream, parsea los bloques `event:`/`data:` y entrega cada AppEvent
    // que no sea heartbeat. Reconecta con backoff hasta que se llame al cierre.
    subscribeEvents(onEvent) {
      const controller = new AbortController();
      let closed = false;

      const run = async (): Promise<void> => {
        while (!closed) {
          try {
            const token = store.getState().accessToken;
            const res = await fetch(url('/events'), {
              headers: {
                Accept: 'text/event-stream',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal: controller.signal,
            });
            if (res.status === 401 && (await tryRefresh())) {
              continue; // reintenta con el token renovado
            }
            if (!res.ok || !res.body) {
              throw new Error(`SSE status ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (!closed) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              // Los eventos SSE se separan por una línea en blanco.
              let sep: number;
              while ((sep = buffer.indexOf('\n\n')) !== -1) {
                const block = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                let eventType = 'message';
                const dataLines: string[] = [];
                for (const line of block.split('\n')) {
                  if (line.startsWith('event:')) {
                    eventType = line.slice(6).trim();
                  } else if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trim());
                  }
                }
                if (eventType === 'ping' || dataLines.length === 0) {
                  continue; // heartbeat o bloque sin datos
                }
                try {
                  const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
                  onEvent({ type: eventType as AppEvent['type'], data });
                } catch {
                  // Bloque malformado: lo ignoramos sin romper el stream.
                }
              }
            }
          } catch {
            if (closed) {
              return;
            }
            // Conexión caída: esperamos antes de reconectar (backoff fijo simple).
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      };

      void run();
      return () => {
        closed = true;
        controller.abort();
      };
    },
  };
}
