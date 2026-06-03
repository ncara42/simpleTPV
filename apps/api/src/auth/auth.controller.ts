import {
  Body,
  Controller,
  Get,
  Ip,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { LoginDto, RefreshDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import type { JwtPayload } from './jwt-payload.js';
import { Public } from './public.decorator.js';

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
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) {
      this.logger.warn(`Login fallido: email=${dto.email} ip=${ip}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.logger.log(`Login OK: userId=${user.id} org=${user.organizationId} ip=${ip}`);
    return this.auth.login(user);
  }

  @Post('refresh')
  @Public()
  async refresh(@Body() dto: RefreshDto, @Ip() ip: string): Promise<{ accessToken: string }> {
    try {
      const result = await this.auth.refresh(dto.refreshToken);
      this.logger.log(`Refresh OK: ip=${ip}`);
      return result;
    } catch (err) {
      this.logger.warn(`Refresh fallido: ip=${ip}`);
      throw err;
    }
  }

  // Protegida por el AuthGuard global (no @Public).
  @Get('me')
  me(@Req() req: { user: JwtPayload }): JwtPayload {
    return req.user;
  }
}
