import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { LoginDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import type { JwtPayload } from './jwt-payload.js';
import { Public } from './public.decorator.js';

// El refresh token vive SOLO en una cookie httpOnly (SEC-20): inaccesible a JS, así
// que un XSS no puede robarlo. El access token (corta vida) sí viaja en el body y
// el frontend lo guarda en memoria. La cookie es Secure en producción y SameSite
// strict (el frontend y la API comparten origen tras el proxy /api), lo que además
// corta CSRF sobre /auth/refresh.
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d (alineado con JWT_REFRESH_TTL)

// Tipos estructurales mínimos del Request/Response de Express (evita depender de
// los tipos de `express`): solo lo que usamos para la cookie del refresh.
interface ResponseLike {
  cookie(name: string, value: string, options?: unknown): unknown;
  clearCookie(name: string, options?: unknown): unknown;
}
interface RequestLike {
  headers: { cookie?: string };
}

function refreshCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

// Lee una cookie de la cabecera `Cookie` sin depender de cookie-parser.
function readCookie(req: RequestLike, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

@Controller('auth')
export class AuthController {
  // Auditoría de eventos de autenticación (SEC-23): login OK/KO y refresh con IP,
  // para detección de fuerza bruta y forense. NUNCA se loguean password ni tokens.
  // La IP es real gracias a `trust proxy` (SEC-08).
  private readonly logger = new Logger('Auth');

  constructor(private readonly auth: AuthService) {}

  // Login endurecido contra fuerza bruta: 5 intentos por minuto y por IP. El resto
  // de la API usa el límite global más holgado del ThrottlerModule.
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<{ accessToken: string }> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) {
      this.logger.warn(`Login fallido: email=${dto.email} ip=${ip}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.logger.log(`Login OK: userId=${user.id} org=${user.organizationId} ip=${ip}`);
    const { accessToken, refreshToken } = await this.auth.login(user);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return { accessToken };
  }

  // Rotación de refresh (SEC-06): el token llega por la cookie httpOnly, no por el
  // body. Emite un access token nuevo y rota la cookie. Ante cualquier fallo (token
  // inválido, reuso, sesión revocada) limpia la cookie para forzar un login.
  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: RequestLike,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<{ accessToken: string }> {
    const token = readCookie(req, REFRESH_COOKIE);
    try {
      const { accessToken, refreshToken } = await this.auth.refresh(token ?? '');
      res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
      this.logger.log(`Refresh OK: ip=${ip}`);
      return { accessToken };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      this.logger.warn(`Refresh fallido: ip=${ip}`);
      throw err;
    }
  }

  // Logout: revoca la familia del refresh token (server-side) y limpia la cookie.
  // Público porque el access token puede haber caducado; la cookie identifica la
  // sesión. Idempotente.
  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  // Protegida por el AuthGuard global (no @Public).
  @Get('me')
  me(@Req() req: { user: JwtPayload }): JwtPayload {
    return req.user;
  }
}
