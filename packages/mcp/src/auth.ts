import { getConfig } from './config.js';

interface TokenEntry {
  value: string;
  expiresAt: number;
}

let _token: TokenEntry | null = null;

export async function getToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt) {
    return _token.value;
  }
  return doLogin();
}

export function invalidate(): void {
  _token = null;
}

async function doLogin(): Promise<string> {
  const { apiUrl, email, password } = getConfig();

  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { accessToken: string };
  _token = {
    value: body.accessToken,
    expiresAt: Date.now() + 14 * 60 * 1000, // renueva 1 min antes del TTL de 15 min
  };
  return _token.value;
}
