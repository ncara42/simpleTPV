/**
 * Claves de firma de los access tokens del MCP (ES256, EC P-256) vía `jose`.
 *
 * El AS y el RS viven en el mismo proceso, así que la verificación es local
 * con la clave pública derivada de la privada (sin fetch de JWKS). Aun así
 * publicamos la JWKS pública por si un cliente quiere validar.
 *
 * En producción se inyecta MCP_JWT_PRIVATE_JWK (JWK privada EC P-256) para que
 * los tokens sobrevivan a reinicios y se compartan entre instancias. En local,
 * si no hay clave, se genera una efímera y se avisa.
 */

import type { webcrypto } from 'node:crypto';

import { exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';

import { getHttpConfig } from './config.js';

/** Clave Web Crypto de Node, sin necesidad de incluir `lib: DOM`. */
type KeyLike = webcrypto.CryptoKey;

export interface SigningKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  /** JWK pública (sin `d`) para publicar en la JWKS. */
  publicJwk: JWK;
  kid: string;
}

let _keys: SigningKeys | null = null;

export const SIGNING_ALG = 'ES256';

export async function getSigningKeys(): Promise<SigningKeys> {
  if (_keys) return _keys;

  const { privateJwk } = getHttpConfig();

  if (privateJwk) {
    const jwk = JSON.parse(privateJwk) as JWK;
    _keys = await fromJwk(jwk);
    return _keys;
  }

  // Sin clave configurada: efímera para desarrollo local.
  console.error(
    'WARN: MCP_JWT_PRIVATE_JWK no configurada — genero una clave efímera. ' +
      'Los access tokens dejarán de ser válidos al reiniciar. Configúrala en producción.',
  );
  const { privateKey } = await generateKeyPair(SIGNING_ALG, { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = 'dev-ephemeral';
  _keys = await fromJwk(jwk);
  return _keys;
}

async function fromJwk(jwk: JWK): Promise<SigningKeys> {
  const kid = jwk.kid ?? 'mcp-key';
  const privateKey = (await importJWK({ ...jwk, kid }, SIGNING_ALG)) as KeyLike;

  // La JWK pública es la privada sin el material secreto.
  const publicJwk: JWK = { ...jwk, kid };
  delete publicJwk.d;
  const publicKey = (await importJWK(publicJwk, SIGNING_ALG)) as KeyLike;

  return { privateKey, publicKey, publicJwk, kid };
}
