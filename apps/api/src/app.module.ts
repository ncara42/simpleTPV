import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { CacheModule } from './cache/cache.module.js';
import { CashSessionsModule } from './cash-sessions/cash-sessions.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductFamiliesModule } from './product-families/product-families.module.js';
import { ProductsModule } from './products/products.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { ReturnsModule } from './returns/returns.module.js';
import { SalesModule } from './sales/sales.module.js';
import { StockModule } from './stock/stock.module.js';
import { StoresModule } from './stores/stores.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UsersModule } from './users/users.module.js';
import { VerifactuModule } from './verifactu/verifactu.module.js';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    EventsModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    ProductFamiliesModule,
    UsersModule,
    StoresModule,
    SalesModule,
    StockModule,
    ReturnsModule,
    TransfersModule,
    SuppliersModule,
    PurchasesModule,
    VerifactuModule,
    CashSessionsModule,
    DashboardModule,
    MeModule,
  ],
  // Orden de guards: AuthGuard primero (popula request.user desde el JWT),
  // luego RolesGuard (lee user.role). Los APP_GUARD corren en orden de registro.
  // Rutas marcadas con @Public() saltan el AuthGuard.
  // Interceptores: TenantContext primero (abre el AsyncLocalStorage del tenant),
  // luego Audit (su insert corre dentro de ese contexto → RLS aplicada).
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
