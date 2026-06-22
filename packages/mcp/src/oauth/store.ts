/**
 * Almacén del estado OAuth: clientes registrados (DCR), códigos de autorización,
 * refresh tokens y sesiones de backend por usuario.
 *
 * Fase 0: implementación en memoria con TTL, suficiente para arrancar y para los
 * tests. Fase 2: implementación sobre Redis (REDIS_URL) — misma interfaz, para
 * que varias instancias compartan estado y sobreviva a reinicios.
 */

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/** Código de autorización pendiente de canjear (single-use, TTL corto). */
export interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  /** Recurso solicitado (RFC 8707), si vino. */
  resource: string | undefined;
  /** Identidad ya resuelta contra el backend en el paso de login. */
  sub: string;
  organizationId: string;
  role: string;
  /** Referencia a la sesión de backend asociada a este grant. */
  grantId: string;
  expiresAt: number;
}

/** Refresh token del MCP (rotatorio). */
export interface RefreshTokenRecord {
  clientId: string;
  scopes: string[];
  sub: string;
  organizationId: string;
  role: string;
  grantId: string;
  expiresAt: number;
}

/**
 * Sesión de backend de un usuario: el refresh token (cookie) que devolvió
 * /auth/login, cifrado en reposo. Permite al MCP obtener access tokens de
 * backend frescos sin reenviar el token del cliente (sin passthrough).
 */
export interface BackendSessionRecord {
  /** Cookie de refresh del backend, cifrada (Fase 3). */
  refreshCookieEnc: string;
  organizationId: string;
  sub: string;
  role: string;
}

export interface OAuthStore {
  // Clientes (DCR)
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  saveClient(client: OAuthClientInformationFull): Promise<void>;

  // Códigos de autorización (single-use)
  saveCode(code: string, record: AuthorizationCodeRecord): Promise<void>;
  takeCode(code: string): Promise<AuthorizationCodeRecord | undefined>;

  // Refresh tokens (rotatorios)
  saveRefresh(token: string, record: RefreshTokenRecord): Promise<void>;
  takeRefresh(token: string): Promise<RefreshTokenRecord | undefined>;
  revokeRefresh(token: string): Promise<void>;

  // Sesiones de backend
  saveBackendSession(grantId: string, record: BackendSessionRecord): Promise<void>;
  getBackendSession(grantId: string): Promise<BackendSessionRecord | undefined>;
  deleteBackendSession(grantId: string): Promise<void>;
}

/** Implementación en memoria (Fase 0). */
export class InMemoryOAuthStore implements OAuthStore {
  private clients = new Map<string, OAuthClientInformationFull>();
  private codes = new Map<string, AuthorizationCodeRecord>();
  private refresh = new Map<string, RefreshTokenRecord>();
  private sessions = new Map<string, BackendSessionRecord>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async saveClient(client: OAuthClientInformationFull): Promise<void> {
    this.clients.set(client.client_id, client);
  }

  async saveCode(code: string, record: AuthorizationCodeRecord): Promise<void> {
    this.codes.set(code, record);
  }

  async takeCode(code: string): Promise<AuthorizationCodeRecord | undefined> {
    const rec = this.codes.get(code);
    this.codes.delete(code); // single-use
    if (!rec) return undefined;
    if (Date.now() > rec.expiresAt) return undefined;
    return rec;
  }

  async saveRefresh(token: string, record: RefreshTokenRecord): Promise<void> {
    this.refresh.set(token, record);
  }

  async takeRefresh(token: string): Promise<RefreshTokenRecord | undefined> {
    const rec = this.refresh.get(token);
    this.refresh.delete(token); // rotación: el refresh usado se invalida
    if (!rec) return undefined;
    if (Date.now() > rec.expiresAt) return undefined;
    return rec;
  }

  async revokeRefresh(token: string): Promise<void> {
    this.refresh.delete(token);
  }

  async saveBackendSession(grantId: string, record: BackendSessionRecord): Promise<void> {
    this.sessions.set(grantId, record);
  }

  async getBackendSession(grantId: string): Promise<BackendSessionRecord | undefined> {
    return this.sessions.get(grantId);
  }

  async deleteBackendSession(grantId: string): Promise<void> {
    this.sessions.delete(grantId);
  }
}
