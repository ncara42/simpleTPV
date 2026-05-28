import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductFamiliesModule } from './product-families/product-families.module.js';
import { ProductsModule } from './products/products.module.js';
import { SalesModule } from './sales/sales.module.js';
import { StoresModule } from './stores/stores.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    ProductFamiliesModule,
    UsersModule,
    StoresModule,
    SalesModule,
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
