import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AUTH_GUARD_CONFIG, AuthGuard, type AuthGuardConfig } from './auth.guard.js';
import { type AuthConfig, AuthService } from './auth.service.js';
import { AuthLookupService } from './auth-lookup.service.js';

function authConfig(): AuthConfig {
  return {
    accessSecret: process.env.JWT_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: (process.env.JWT_ACCESS_TTL ?? '15m') as AuthConfig['accessTtl'],
    refreshTtl: (process.env.JWT_REFRESH_TTL ?? '7d') as AuthConfig['refreshTtl'],
  };
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthLookupService,
    {
      provide: AuthService,
      useFactory: (lookup: AuthLookupService, jwt: JwtService) =>
        new AuthService(lookup, jwt, authConfig()),
      inject: [AuthLookupService, JwtService],
    },
    {
      provide: AUTH_GUARD_CONFIG,
      useFactory: (): AuthGuardConfig => ({ accessSecret: authConfig().accessSecret }),
    },
    AuthGuard,
  ],
  // Exportamos JwtModule y el token de config para que módulos que importen
  // AuthModule (p.ej. ProductsModule con @UseGuards(AuthGuard)) puedan resolver
  // las dependencias del guard al reinstanciarlo en su propio contexto.
  exports: [AuthService, AuthGuard, AUTH_GUARD_CONFIG, JwtModule],
})
export class AuthModule {}
