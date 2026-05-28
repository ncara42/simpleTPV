import { Global, Module } from '@nestjs/common';

import { CACHE } from './cache.interface.js';
import { MemoryCache } from './memory-cache.js';
import { createRedisClient, RedisCache } from './redis-cache.js';

// Provee el token CACHE en todo el árbol (módulo global). Con REDIS_URL usa
// Redis (degradando a Postgres si falla); sin ella, un MemoryCache en proceso
// (útil en tests/CI sin Redis). El cache es siempre una optimización.
@Global()
@Module({
  providers: [
    {
      provide: CACHE,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        return url ? new RedisCache(createRedisClient(url)) : new MemoryCache();
      },
    },
  ],
  exports: [CACHE],
})
export class CacheModule {}
