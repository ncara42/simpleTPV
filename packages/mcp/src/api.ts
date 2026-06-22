import { getToken, invalidate } from './auth.js';
import { getConfig } from './config.js';

function buildQs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function doFetch(url: string, token: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

export async function apiGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { apiUrl } = getConfig();
  const url = `${apiUrl}${path}${buildQs(params)}`;

  let token = await getToken();
  let res = await doFetch(url, token);

  if (res.status === 401) {
    invalidate();
    token = await getToken();
    res = await doFetch(url, token);
  }

  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

type TextContent = { type: 'text'; text: string };

export function ok(data: unknown): { content: TextContent[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function fail(e: unknown): { content: TextContent[]; isError: true } {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}
