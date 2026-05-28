import { describe, expect, it } from 'vitest';

import { buildQrData, computeHash, type VerifactuPayload } from './verifactu.hash.js';

const payload: VerifactuPayload = {
  nif: 'B11111111',
  invoiceNumber: 'T01-000001',
  date: '2026-05-28T10:00:00.000Z',
  total: 12.5,
  type: 'INVOICE',
};

describe('computeHash', () => {
  it('es determinista para el mismo payload y previousHash', () => {
    expect(computeHash(payload, null)).toBe(computeHash(payload, null));
  });

  it('encadena: distinta huella previa → distinta huella', () => {
    const h1 = computeHash(payload, null);
    const h2 = computeHash(payload, 'previo');
    expect(h1).not.toBe(h2);
  });

  it('cambiar un campo cambia la huella (inalterabilidad)', () => {
    const base = computeHash(payload, 'p');
    const changed = computeHash({ ...payload, total: 99 }, 'p');
    expect(base).not.toBe(changed);
  });

  it('devuelve un hex SHA-256 (64 chars)', () => {
    expect(computeHash(payload, null)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildQrData', () => {
  it('incluye nif, número e importe en la URL de cotejo', () => {
    const qr = buildQrData('B11111111', 'T01-000001', 12.5);
    expect(qr).toContain('nif=B11111111');
    expect(qr).toContain('numserie=T01-000001');
    expect(qr).toContain('importe=12.50');
  });
});
