/**
 * OAuthServerProvider: la lógica del Authorization Server. El SDK
 * (`mcpAuthRouter`) monta los endpoints HTTP (/authorize, /token, /register,
 * /revoke), valida PKCE y parsea las peticiones; este provider aporta la lógica:
 * registro de clientes (DCR), redirección al login delegado al backend, y
 * emisión/rotación de tokens.
 *
 * El paso de credenciales NO ocurre aquí: `authorize` redirige a /mcp-login
 * (ver http/app.ts), que hace el challenge HTTP Basic, valida contra el backend
 * y crea el código de autorización. Aquí solo se canjea ese código por tokens.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';

import { getHttpConfig } from './config.js';
import type { OAuthStore } from './store.js';
import { mintAccessToken } from './tokens.js';
import { tokenVerifier } from './verifier.js';

const CLIENT_SECRET_BYTES = 32;
const REFRESH_TOKEN_BYTES = 32;
/** Vida del refresh token del MCP (alineada con el refresh del backend). */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Datos de un grant suficientes para emitir tokens. */
interface GrantClaims {
  clientId: string;
  scopes: string[];
  sub: string;
  organizationId: string;
  role: string;
  grantId: string;
}

export class SimpleTpvOAuthProvider implements OAuthServerProvider {
  constructor(private readonly store: OAuthStore) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.store.getClient(clientId),
      registerClient: async (client) => {
        // El SDK ya validó la metadata (RFC 7591). Generamos id y, salvo cliente
        // público (token_endpoint_auth_method = "none"), un secreto.
        const isPublic = client.token_endpoint_auth_method === 'none';
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          ...(isPublic
            ? {}
            : {
                client_secret: randomBytes(CLIENT_SECRET_BYTES).toString('base64url'),
                client_secret_expires_at: 0, // sin expiración
              }),
        };
        await this.store.saveClient(full);
        return full;
      },
    };
  }

  // ─── Flujo de autorización ───────────────────────────────────────────────────
  /**
   * Redirige el navegador a /mcp-login con los parámetros OAuth. Allí se hace el
   * challenge HTTP Basic (sin pantalla propia), se valida contra el backend y se
   * crea el código de autorización ligado a este `code_challenge`.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const { issuerUrl } = getHttpConfig();
    const loginUrl = new URL('/mcp-login', issuerUrl);
    loginUrl.searchParams.set('client_id', client.client_id);
    loginUrl.searchParams.set('redirect_uri', params.redirectUri);
    loginUrl.searchParams.set('code_challenge', params.codeChallenge);
    if (params.state) loginUrl.searchParams.set('state', params.state);
    if (params.scopes && params.scopes.length > 0) {
      loginUrl.searchParams.set('scope', params.scopes.join(' '));
    }
    if (params.resource) loginUrl.searchParams.set('resource', params.resource.href);
    res.redirect(302, loginUrl.href);
  }

  /** El SDK pide el challenge para validar PKCE antes de canjear (lectura no destructiva). */
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const rec = await this.store.peekCode(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new InvalidGrantError('código de autorización inválido');
    }
    return rec.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const rec = await this.store.takeCode(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new InvalidGrantError('código de autorización inválido o expirado');
    }
    if (redirectUri !== undefined && redirectUri !== rec.redirectUri) {
      throw new InvalidGrantError('redirect_uri no coincide con el de la autorización');
    }
    return this.issueTokens(rec);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    // Rotación: el refresh usado se invalida (takeRefresh lo borra).
    const rec = await this.store.takeRefresh(refreshToken);
    if (!rec || rec.clientId !== client.client_id) {
      throw new InvalidGrantError('refresh token inválido o expirado');
    }
    // Un refresh solo puede estrechar scopes, nunca ampliarlos.
    const grantedScopes =
      scopes && scopes.length > 0 ? rec.scopes.filter((s) => scopes.includes(s)) : rec.scopes;
    return this.issueTokens({ ...rec, scopes: grantedScopes });
  }

  /** Emite un access token (JWT) + un refresh token nuevo (rotación). */
  private async issueTokens(grant: GrantClaims): Promise<OAuthTokens> {
    const { token, expiresInSecs } = await mintAccessToken({
      sub: grant.sub,
      organizationId: grant.organizationId,
      role: grant.role,
      clientId: grant.clientId,
      scopes: grant.scopes,
      grantId: grant.grantId,
    });

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.store.saveRefresh(refreshToken, {
      clientId: grant.clientId,
      scopes: grant.scopes,
      sub: grant.sub,
      organizationId: grant.organizationId,
      role: grant.role,
      grantId: grant.grantId,
      expiresAt: Date.now() + REFRESH_TTL_MS,
    });

    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: expiresInSecs,
      refresh_token: refreshToken,
      scope: grant.scopes.join(' '),
    };
  }

  // ─── Resource Server ─────────────────────────────────────────────────────────
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return tokenVerifier.verifyAccessToken(token);
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.store.revokeRefresh(request.token);
  }
}
