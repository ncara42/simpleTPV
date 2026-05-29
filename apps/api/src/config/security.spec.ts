import { describe, expect, it } from 'vitest';

import { DEFAULT_DEV_ORIGINS, parseCorsOrigins, throttleConfig } from './security.js';

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
