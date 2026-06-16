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

// Roles privilegiados para los que la revalidación de sesión es fail-closed: si el
// lookup de estado falla (BD de auth caída), denegamos en vez de dejar pasar el
// token. Cierra la ventana de privilegios obsoletos (un ADMIN/MANAGER degradado o
// desactivado que conserva poderes hasta caducar el access token) ante un fallo
// selectivo de la BD. Los roles no privilegiados mantienen fail-open: la firma del
// JWT ya garantiza autenticidad y priorizamos disponibilidad para el operador de
// caja, cuyo radio de daño con privilegios obsoletos es mínimo.
const FAIL_CLOSED_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MANAGER']);

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
  // hasta que caduca su access token. Ante error de infraestructura aplicamos
  // fail-closed selectivo: denegamos para roles privilegiados (FAIL_CLOSED_ROLES) y
  // dejamos pasar al resto (la firma del token ya garantiza autenticidad y para
  // roles de bajo privilegio priorizamos disponibilidad).
  private async revalidate(payload: JwtPayload): Promise<void> {
    if (!this.userState) {
      return;
    }
    let state: Awaited<ReturnType<UserStateValidator['getState']>>;
    try {
      state = await this.userState.getState(payload.sub);
    } catch {
      // Error de infraestructura → fail-closed para roles privilegiados.
      if (FAIL_CLOSED_ROLES.has(payload.role)) {
        throw new UnauthorizedException(
          'No se puede verificar la sesión ahora mismo: inténtalo de nuevo',
        );
      }
      return; // roles no privilegiados → fail-open
    }
    if (!state || !state.active) {
      throw new UnauthorizedException('La sesión ya no es válida: usuario inactivo');
    }
    if (state.role !== payload.role) {
      throw new UnauthorizedException('Los permisos han cambiado: vuelve a iniciar sesión');
    }
  }
}
