import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { JwtPayload } from './jwt-payload.js';

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

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.auth.login(user);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string }> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: JwtPayload }): JwtPayload {
    return req.user;
  }
}
