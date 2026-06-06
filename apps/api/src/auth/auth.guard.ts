import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { JwtPayload } from './jwt-payload.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { USER_STATE_VALIDATOR, type UserStateValidator } from './user-state.service.js';

export interface AuthGuardConfig {
  accessSecret: string;
}

// Token de inyección para la config del guard, necesario para que Nest pueda
// instanciar AuthGuard cuando se usa vía @UseGuards(AuthGuard).
export const AUTH_GUARD_CONFIG = Symbol('AUTH_GUARD_CONFIG');

function extractBearer(header: unknown): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_GUARD_CONFIG) private readonly config: AuthGuardConfig,
    @Optional() private readonly reflector?: Reflector,
    // Revalidación del estado del usuario por petición (A-04). Opcional: en los
    // contextos que reinstancian el guard sin proveerlo, la revalidación se omite
    // y queda el comportamiento base (solo verifica la firma del JWT).
    @Optional()
    @Inject(USER_STATE_VALIDATOR)
    private readonly userState?: UserStateValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
      user?: JwtPayload;
    }>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Falta el token Bearer');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    await this.revalidate(payload);
    req.user = payload;
    return true;
  }

  // Revalida que el usuario del token siga activo y con el mismo rol (A-04). Cierra
  // la ventana en la que un usuario desactivado o degradado conserva privilegios
  // hasta que caduca su access token. Fail-open ante error de infraestructura: si
  // el lookup falla (BD caída), no convertimos eso en una caída total de auth — la
  // firma del token ya garantiza autenticidad y esto es defensa en profundidad.
  private async revalidate(payload: JwtPayload): Promise<void> {
    if (!this.userState) {
      return;
    }
    let state: Awaited<ReturnType<UserStateValidator['getState']>>;
    try {
      state = await this.userState.getState(payload.sub);
    } catch {
      return; // error de infraestructura → fail-open
    }
    if (!state || !state.active) {
      throw new UnauthorizedException('La sesión ya no es válida: usuario inactivo');
    }
    if (state.role !== payload.role) {
      throw new UnauthorizedException('Los permisos han cambiado: vuelve a iniciar sesión');
    }
  }
}
