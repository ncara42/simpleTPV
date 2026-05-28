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
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.accessSecret,
      });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
