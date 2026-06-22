import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from './config.js';

describe('parseTrustProxy (Express trust proxy desde MCP_TRUST_PROXY)', () => {
  it('sin definir → false (local, sin proxy delante)', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('vacío o solo espacios → false', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('   ')).toBe(false);
  });

  it('"true"/"false" → booleano', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('entero → número de saltos (caso Traefik = 1)', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('3')).toBe(3);
  });

  it('recorta espacios alrededor antes de parsear', () => {
    expect(parseTrustProxy('  2  ')).toBe(2);
  });

  it('cualquier otra cosa → string (subred/loopback)', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });
});
