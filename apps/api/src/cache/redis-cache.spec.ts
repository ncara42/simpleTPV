import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { RedisCache } from './redis-cache.js';

// Fake mínimo de ioredis: solo on/get/set/del. `on` se ignora (no emitimos
// errores en el fake feliz). Configurable para que get/set/del lancen y así
// probar la degradación.
function makeRedis(opts: { fail?: boolean } = {}): Redis {
  const fail = opts.fail ?? false;
  const boom = async () => {
    throw new Error('ECONNREFUSED');
  };
  return {
    on: vi.fn(),
    get: fail ? vi.fn(boom) : vi.fn(async (_k: string) => 'cached-value'),
    set: fail ? vi.fn(boom) : vi.fn(async () => 'OK'),
    del: fail ? vi.fn(boom) : vi.fn(async () => 1),
  } as unknown as Redis;
}

describe('RedisCache (camino feliz)', () => {
  it('get devuelve el valor de Redis', async () => {
    const cache = new RedisCache(makeRedis());
    expect(await cache.get('k')).toBe('cached-value');
  });

  it('set y del delegan en el cliente', async () => {
    const redis = makeRedis();
    const cache = new RedisCache(redis);
    await cache.set('k', 'v');
    await cache.del('k');
    expect(redis.set).toHaveBeenCalledWith('k', 'v');
    expect(redis.del).toHaveBeenCalledWith('k');
  });
});

describe('RedisCache (degradación: Redis caído)', () => {
  it('get devuelve null si el cliente lanza (no propaga el error)', async () => {
    const cache = new RedisCache(makeRedis({ fail: true }));
    await expect(cache.get('k')).resolves.toBeNull();
  });

  it('set y del son no-op si el cliente lanza (no propagan)', async () => {
    const cache = new RedisCache(makeRedis({ fail: true }));
    await expect(cache.set('k', 'v')).resolves.toBeUndefined();
    await expect(cache.del('k')).resolves.toBeUndefined();
  });
});
