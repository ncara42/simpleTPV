import { describe, expect, it } from 'vitest';

import { getHttpConfig, parseTrustProxy } from './config.js';

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

describe('getHttpConfig — trust proxy en modo HTTP', () => {
  it('sin MCP_TRUST_PROXY definido, el default efectivo es 1 (tras proxy inverso)', () => {
    // El setup de tests no define MCP_TRUST_PROXY → debe caer al default `1`
    // (evita ERR_ERL_UNEXPECTED_X_FORWARDED_FOR detrás de Traefik/Cloudflare).
    expect(getHttpConfig().trustProxy).toBe(1);
  });
});
