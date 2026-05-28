import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import type { Cache } from './cache.interface.js';

// Cache respaldado por Redis. Es una OPTIMIZACIÓN, no la fuente de verdad: ante
// cualquier error (Redis caído, timeout) get devuelve null y set/del son no-op,
// para que el llamante degrade a Postgres sin romper. Solo logueamos un warning
// (con dedupe básico) para no inundar los logs si Redis está caído un rato.
export class RedisCache implements Cache {
  private readonly logger = new Logger(RedisCache.name);
  private warned = false;

  constructor(private readonly redis: Redis) {
    // Sin este listener, ioredis emite 'error' como unhandled y tumba el proceso.
    this.redis.on('error', (err) => this.warnOnce(err));
  }

  private warnOnce(err: unknown): void {
    if (!this.warned) {
      this.logger.warn(`Redis no disponible, degradando a Postgres: ${String(err)}`);
      this.warned = true;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.redis.get(key);
      this.warned = false; // recuperado
      return value;
    } catch (err) {
      this.warnOnce(err);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.redis.set(key, value);
    } catch (err) {
      this.warnOnce(err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.warnOnce(err);
    }
  }
}

// Fábrica del cliente ioredis con ajustes para que un Redis caído NO bloquee la
// API: un único intento por request y reconexión acotada. La offline queue queda
// activa (default) para que los comandos emitidos antes de que la conexión esté
// lista se encolen y se sirvan al conectar, en vez de rechazar el primer comando.
// Si Redis está realmente caído, maxRetriesPerRequest agota rápido y RedisCache
// lo traduce a degradación a Postgres.
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
}
