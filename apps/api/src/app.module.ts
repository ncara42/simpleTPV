import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { TenantContextInterceptor } from './auth/tenant-context.interceptor.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductFamiliesModule } from './product-families/product-families.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [PrismaModule, AuthModule, HealthModule, ProductsModule, ProductFamiliesModule],
  // Orden de guards: AuthGuard primero (popula request.user desde el JWT),
  // luego RolesGuard (lee user.role). Los APP_GUARD corren en orden de registro.
  // Rutas marcadas con @Public() saltan el AuthGuard.
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
