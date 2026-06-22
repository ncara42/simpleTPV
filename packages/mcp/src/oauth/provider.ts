/**
 * OAuthServerProvider: la lógica del Authorization Server. El SDK
 * (`mcpAuthRouter`) monta los endpoints HTTP (/authorize, /token, /register,
 * /revoke), valida PKCE y parsea las peticiones; este provider aporta la lógica:
 * registro de clientes (DCR), login delegado al backend, y emisión/rotación de
 * tokens.
 *
 * Fase 0: DCR + verificación de tokens operativos. `authorize`,
 * `exchangeAuthorizationCode` y `exchangeRefreshToken` se implementan en Fase 2.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
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

import type { OAuthStore } from './store.js';
import { tokenVerifier } from './verifier.js';

const CLIENT_SECRET_BYTES = 32;

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

  // ─── Flujo de autorización (Fase 2) ──────────────────────────────────────────
  async authorize(
    _client: OAuthClientInformationFull,
    _params: AuthorizationParams,
    _res: Response,
  ): Promise<void> {
    throw new ServerError('authorize: pendiente de la Fase 2 (login delegado al backend)');
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string,
  ): Promise<string> {
    throw new ServerError('challengeForAuthorizationCode: pendiente de la Fase 2');
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    throw new ServerError('exchangeAuthorizationCode: pendiente de la Fase 2');
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    _refreshToken: string,
    _scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    throw new ServerError('exchangeRefreshToken: pendiente de la Fase 2');
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
