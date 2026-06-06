import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AUTH_GUARD_CONFIG, AuthGuard, type AuthGuardConfig } from './auth.guard.js';
import { type AuthConfig, AuthService } from './auth.service.js';
import { AuthLookupService } from './auth-lookup.service.js';
import { USER_STATE_VALIDATOR, UserStateService } from './user-state.service.js';

function requireSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} es obligatoria: no hay valor por defecto para el secreto JWT`);
  }
  return value;
}

function authConfig(): AuthConfig {
  return {
    accessSecret: requireSecret('JWT_SECRET'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET'),
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
      // AuthLookupService implementa UserLookup y RefreshTokenStore (misma conexión
      // app_admin/BYPASSRLS), así que se pasa para ambos puertos.
      useFactory: (lookup: AuthLookupService, jwt: JwtService) =>
        new AuthService(lookup, lookup, jwt, authConfig()),
      inject: [AuthLookupService, JwtService],
    },
    {
      provide: AUTH_GUARD_CONFIG,
      useFactory: (): AuthGuardConfig => ({ accessSecret: authConfig().accessSecret }),
    },
    // Revalidación del estado del usuario por petición (A-04). El alias del token
    // desacopla al guard de la implementación concreta (y permite mockearla).
    UserStateService,
    { provide: USER_STATE_VALIDATOR, useExisting: UserStateService },
    AuthGuard,
  ],
  // Exportamos JwtModule y el token de config para que módulos que importen
  // AuthModule (p.ej. ProductsModule con @UseGuards(AuthGuard)) puedan resolver
  // las dependencias del guard al reinstanciarlo en su propio contexto.
  exports: [AuthService, AuthGuard, AUTH_GUARD_CONFIG, USER_STATE_VALIDATOR, JwtModule],
})
export class AuthModule {}
