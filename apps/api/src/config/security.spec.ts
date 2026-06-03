import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEV_ORIGINS,
  parseCorsOrigins,
  sseMaxConnectionsPerUser,
  throttleConfig,
} from './security.js';

describe('parseCorsOrigins', () => {
  it('sin env devuelve los orígenes de dev por defecto', () => {
    expect(parseCorsOrigins(undefined)).toEqual(DEFAULT_DEV_ORIGINS);
    expect(parseCorsOrigins('')).toEqual(DEFAULT_DEV_ORIGINS);
    expect(parseCorsOrigins('   ')).toEqual(DEFAULT_DEV_ORIGINS);
  });

  it('parsea un CSV recortando espacios y descartando vacíos', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,, https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('un único origen', () => {
    expect(parseCorsOrigins('https://backoffice.example.com')).toEqual([
      'https://backoffice.example.com',
    ]);
  });
});

describe('throttleConfig', () => {
  it('defaults holgados sin env', () => {
    expect(throttleConfig({})).toEqual({ ttl: 60000, limit: 120 });
  });

  it('toma los valores de las env válidas', () => {
    expect(throttleConfig({ THROTTLE_TTL: '30000', THROTTLE_LIMIT: '50' })).toEqual({
      ttl: 30000,
      limit: 50,
    });
  });

  it('ignora valores inválidos o no positivos y cae a los defaults', () => {
    expect(throttleConfig({ THROTTLE_TTL: 'abc', THROTTLE_LIMIT: '-5' })).toEqual({
      ttl: 60000,
      limit: 120,
    });
  });
});

describe('sseMaxConnectionsPerUser', () => {
  it('default 5 sin env', () => {
    expect(sseMaxConnectionsPerUser({})).toBe(5);
  });

  it('toma el valor de la env válida (entero)', () => {
    expect(sseMaxConnectionsPerUser({ SSE_MAX_CONNECTIONS_PER_USER: '3' })).toBe(3);
    expect(sseMaxConnectionsPerUser({ SSE_MAX_CONNECTIONS_PER_USER: '10.9' })).toBe(10);
  });

  it('ignora valores inválidos o no positivos y cae al default', () => {
    expect(sseMaxConnectionsPerUser({ SSE_MAX_CONNECTIONS_PER_USER: 'abc' })).toBe(5);
    expect(sseMaxConnectionsPerUser({ SSE_MAX_CONNECTIONS_PER_USER: '0' })).toBe(5);
    expect(sseMaxConnectionsPerUser({ SSE_MAX_CONNECTIONS_PER_USER: '-2' })).toBe(5);
  });
});
