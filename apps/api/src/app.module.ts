import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { B2bModule } from './b2b/b2b.module.js';
import { CacheModule } from './cache/cache.module.js';
import { CashSessionsModule } from './cash-sessions/cash-sessions.module.js';
import { throttleConfig } from './config/security.js';
import { TestAwareThrottlerGuard } from './config/test-aware-throttler.guard.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { EventsModule } from './events/events.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductFamiliesModule } from './product-families/product-families.module.js';
import { ProductsModule } from './products/products.module.js';
import { PublicModule } from './public/public.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { ReturnsModule } from './returns/returns.module.js';
import { SalesModule } from './sales/sales.module.js';
import { StockModule } from './stock/stock.module.js';
import { StoreOrdersModule } from './store-orders/store-orders.module.js';
import { StoresModule } from './stores/stores.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { TimeClockModule } from './time-clock/time-clock.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UsersModule } from './users/users.module.js';
import { VerifactuModule } from './verifactu/verifactu.module.js';
import { ZReportModule } from './z-report/z-report.module.js';

const throttle = throttleConfig(process.env);

@Module({
  imports: [
    // Rate limiting global por IP (#72). Límite holgado para el TPV; corta abuso y
    // fuerza bruta. El login lo restringe más con @Throttle a nivel de ruta.
    // S-09 (diferido): el almacenamiento del throttler es EN MEMORIA por proceso.
    // Correcto con réplica única (despliegue actual en Dokploy). Al escalar a
    // varias réplicas hay que respaldarlo en Redis (nestjs-throttler-storage-redis)
    // o un atacante rota entre réplicas y multiplica el límite efectivo.
    ThrottlerModule.forRoot([{ ttl: throttle.ttl, limit: throttle.limit }]),
    PrismaModule,
    CacheModule,
    EventsModule,
    FeatureFlagsModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    ProductFamiliesModule,
    B2bModule,
    UsersModule,
    StoresModule,
    SalesModule,
    StockModule,
    StoreOrdersModule,
    ReturnsModule,
    TransfersModule,
    SuppliersModule,
    PurchasesModule,
    VerifactuModule,
    CashSessionsModule,
    DashboardModule,
    ZReportModule,
    MeModule,
    DevicesModule,
    TimeClockModule,
    ApiKeysModule,
    PublicModule,
  ],
  // Orden de guards: AuthGuard primero (popula request.user desde el JWT),
  // luego RolesGuard (lee user.role). Los APP_GUARD corren en orden de registro.
  // Rutas marcadas con @Public() saltan el AuthGuard.
  // Interceptores: TenantContext primero (abre el AsyncLocalStorage del tenant),
  // luego Audit (su insert corre dentro de ese contexto → RLS aplicada).
  providers: [
    // Captura en Sentry las excepciones no manejadas (#79). Reenvía la excepción
    // tras registrarla: no altera la respuesta HTTP estándar de Nest.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // ThrottlerGuard primero: corta el exceso de peticiones antes de gastar trabajo
    // en validar el JWT. Luego Auth (popula request.user) y Roles (valida el rol).
    // Variante test-aware: se desactiva con NODE_ENV=test para no romper los e2e.
    { provide: APP_GUARD, useClass: TestAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
