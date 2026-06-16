import { describe, expect, it } from 'vitest';

import { JOB_RETENTION, redisOptionsFromUrl } from './redis-options.js';

// DOS-07 / INFRA-03: las colas BullMQ construyen RedisOptions a mano. El helper
// debe forzar TLS ante `rediss:` para que el tráfico a un Redis remoto no viaje en
// claro, y la retención de jobs debe estar acotada (DOS-01) para no fugar memoria.
describe('redisOptionsFromUrl', () => {
  it('parsea host y puerto de una URL redis:// sin TLS', () => {
    const opts = redisOptionsFromUrl('redis://my-host:6390');
    expect(opts.host).toBe('my-host');
    expect(opts.port).toBe(6390);
    expect(opts.tls).toBeUndefined();
    expect(opts.password).toBeUndefined();
  });

  it('usa el puerto por defecto 6379 cuando la URL no lo especifica', () => {
    expect(redisOptionsFromUrl('redis://localhost').port).toBe(6379);
  });

  it('incluye password solo si la URL lo trae', () => {
    expect(redisOptionsFromUrl('redis://:s3cr3t@localhost:6379').password).toBe('s3cr3t');
    expect(redisOptionsFromUrl('redis://localhost:6379').password).toBeUndefined();
  });

  it('fuerza TLS con verificación de certificado ante rediss://', () => {
    const opts = redisOptionsFromUrl('rediss://remote-host:6380');
    expect(opts.tls).toEqual({ rejectUnauthorized: true });
    expect(opts.host).toBe('remote-host');
    expect(opts.port).toBe(6380);
  });

  it('combina TLS y password en una URL rediss:// con credenciales', () => {
    const opts = redisOptionsFromUrl('rediss://:s3cr3t@remote:6380');
    expect(opts.tls).toEqual({ rejectUnauthorized: true });
    expect(opts.password).toBe('s3cr3t');
  });
});

describe('JOB_RETENTION', () => {
  it('acota el historial de jobs completados y fallidos', () => {
    expect(JOB_RETENTION.removeOnComplete).toEqual({ count: 100 });
    expect(JOB_RETENTION.removeOnFail).toEqual({ count: 50 });
  });
});
