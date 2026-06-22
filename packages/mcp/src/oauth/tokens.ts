/**
 * Emisión y verificación de los access tokens que el MCP entrega al cliente
 * Claude. Son JWT ES256 autocontenidos, vinculados por audiencia (RFC 8707) al
 * identificador del recurso (MCP_RESOURCE_URL), como exige la spec de MCP.
 *
 * El token NO se reenvía nunca al backend (prohibición de token passthrough):
 * solo autentica el salto Claude → MCP. El salto MCP → backend usa un token de
 * backend distinto (ver Fase 3, backend/session.ts).
 */

import { jwtVerify, SignJWT } from 'jose';

import { getHttpConfig } from './config.js';
import { getSigningKeys, SIGNING_ALG } from './keys.js';

/** Vida del access token del MCP. Corto a propósito (la spec recomienda tokens breves). */
export const ACCESS_TOKEN_TTL_SECS = 15 * 60;

export interface AccessTokenClaims {
  /** ID del usuario en el backend SimpleTpv. */
  sub: string;
  /** Tenant: organización del usuario. Clave del aislamiento multi-tenant. */
  organizationId: string;
  /** Rol del backend (ADMIN | MANAGER | CLERK). */
  role: string;
  /** Cliente OAuth (DCR) que solicitó el token. */
  clientId: string;
  /** Scopes concedidos. */
  scopes: string[];
  /** Referencia a la sesión de backend guardada server-side (Fase 3). */
  grantId: string;
}

export interface MintedToken {
  token: string;
  expiresInSecs: number;
}

export async function mintAccessToken(claims: AccessTokenClaims): Promise<MintedToken> {
  const { issuerUrl, resourceUrl } = getHttpConfig();
  const { privateKey, kid } = await getSigningKeys();

  const token = await new SignJWT({
    organizationId: claims.organizationId,
    role: claims.role,
    cid: claims.clientId,
    scope: claims.scopes.join(' '),
    gid: claims.grantId,
  })
    .setProtectedHeader({ alg: SIGNING_ALG, kid, typ: 'at+jwt' })
    .setSubject(claims.sub)
    .setIssuer(issuerUrl.href)
    .setAudience(resourceUrl.href)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECS}s`)
    .sign(privateKey);

  return { token, expiresInSecs: ACCESS_TOKEN_TTL_SECS };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { issuerUrl, resourceUrl } = getHttpConfig();
  const { publicKey } = await getSigningKeys();

  // jose comprueba firma, exp, issuer y audiencia. Si la audiencia no coincide
  // con nuestro recurso, lanza: así rechazamos tokens emitidos para otro destino.
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: issuerUrl.href,
    audience: resourceUrl.href,
    algorithms: [SIGNING_ALG],
  });

  const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';
  return {
    sub: String(payload.sub ?? ''),
    organizationId: String(payload['organizationId'] ?? ''),
    role: String(payload['role'] ?? ''),
    clientId: String(payload['cid'] ?? ''),
    scopes: scope ? scope.split(' ') : [],
    grantId: String(payload['gid'] ?? ''),
  };
}
