/**
 * Resource Server: verificación de los access tokens en cada petición a /mcp.
 *
 * Implementa OAuthTokenVerifier del SDK. `requireBearerAuth` lo invoca, y si el
 * token es válido cuelga el AuthInfo resultante en `req.auth`. Metemos la
 * identidad del tenant (organizationId, role, sub, grantId) en `extra` para que
 * las tools puedan acotar la llamada al backend por organización.
 */

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { getHttpConfig } from './config.js';
import { verifyAccessToken } from './tokens.js';

export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const claims = await verifyAccessToken(token);
      const { resourceUrl } = getHttpConfig();
      return {
        token,
        clientId: claims.clientId,
        scopes: claims.scopes,
        resource: resourceUrl,
        extra: {
          sub: claims.sub,
          organizationId: claims.organizationId,
          role: claims.role,
          grantId: claims.grantId,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'token inválido';
      throw new InvalidTokenError(msg);
    }
  },
};
