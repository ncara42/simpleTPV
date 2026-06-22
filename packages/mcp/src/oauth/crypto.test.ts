import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './crypto.js';

describe('crypto (cifrado de la sesión de backend en reposo)', () => {
  it('descifra lo que cifra (round-trip)', () => {
    const plain = 'refreshToken=abc.def.ghi';
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('usa IV aleatorio (ciphertext distinto cada vez)', () => {
    expect(encryptSecret('mismo')).not.toBe(encryptSecret('mismo'));
  });

  it('rechaza ciphertext manipulado (GCM detecta el tag)', () => {
    const enc = encryptSecret('secreto');
    const buf = Buffer.from(enc, 'base64');
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff;
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });
});
