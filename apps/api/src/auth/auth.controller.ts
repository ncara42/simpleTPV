import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service.js';
import type { JwtPayload } from './jwt-payload.js';
import { Public } from './public.decorator.js';

interface LoginDto {
  email: string;
  password: string;
}

interface RefreshDto {
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Login endurecido contra fuerza bruta: 5 intentos por minuto y por IP. El resto
  // de la API usa el límite global más holgado del ThrottlerModule.
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.auth.login(user);
  }

  @Post('refresh')
  @Public()
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string }> {
    return this.auth.refresh(dto.refreshToken);
  }

  // Protegida por el AuthGuard global (no @Public).
  @Get('me')
  me(@Req() req: { user: JwtPayload }): JwtPayload {
    return req.user;
  }
}
