import { Global, Module } from '@nestjs/common';

import { createRedisClient } from '../cache/redis-cache.js';
import { EVENT_BUS } from './event-bus.interface.js';
import { EventsController } from './events.controller.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';
import { RedisEventBus } from './redis-event-bus.js';

// Provee EVENT_BUS en todo el árbol. Con REDIS_URL usa Redis pub/sub (difunde
// entre réplicas); sin ella, un bus en proceso (una instancia, dev/test).
@Global()
@Module({
  controllers: [EventsController],
  providers: [
    {
      provide: EVENT_BUS,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          return new InMemoryEventBus();
        }
        // pub: conexión compartida para PUBLISH. subFactory: una conexión nueva
        // por suscripción SSE (Redis exige conexión dedicada en modo subscribe).
        return new RedisEventBus(createRedisClient(url), () => createRedisClient(url));
      },
    },
  ],
  exports: [EVENT_BUS],
})
export class EventsModule {}
