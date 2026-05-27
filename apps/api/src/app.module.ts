import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenantMiddleware } from './tenant/tenant.middleware.js';
import { TenantModule } from './tenant/tenant.module.js';

@Module({
  imports: [PrismaModule, TenantModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
