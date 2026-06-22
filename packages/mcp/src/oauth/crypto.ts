/**
 * Cifrado en reposo de secretos de sesión (la cookie de refresh del backend que
 * guardamos por usuario). AES-256-GCM con clave derivada de MCP_ENC_KEY.
 *
 * Si MCP_ENC_KEY no está, se genera una clave efímera y se avisa: en ese caso
 * las sesiones de backend no sobreviven a un reinicio (aceptable solo en local).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { getHttpConfig } from './config.js';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const { encKey } = getHttpConfig();
  if (encKey) {
    // Derivamos 32 bytes deterministas de la clave configurada.
    _key = createHash('sha256').update(encKey).digest();
  } else {
    console.error(
      'WARN: MCP_ENC_KEY no configurada — uso una clave de cifrado efímera. ' +
        'Las sesiones de backend no sobrevivirán a un reinicio. Configúrala en producción.',
    );
    _key = randomBytes(32);
  }
  return _key;
}

/** Cifra texto plano → base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, getKey(), iv, { authTagLength: TAG_BYTES });
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Descifra base64(iv | tag | ciphertext) → texto plano. */
export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  // authTagLength explícito (= default GCM de 16 B): evita que un tag truncado
  // pase la verificación (semgrep gcm-no-tag-length). Retrocompatible.
  const decipher = createDecipheriv(ALG, getKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
