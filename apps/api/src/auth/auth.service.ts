import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  active: boolean;
}

// Puerto mínimo para buscar usuarios durante el login. Se implementa con una
// conexión BYPASSRLS (rol `app_admin`), porque el login busca al usuario por
// email ANTES de conocer su tenant — con el rol `app` + RLS devolvería 0 filas.
export interface UserLookup {
  user: {
    findUnique(args: { where: { email: string } }): Promise<AuthUser | null>;
    findFirst(args: { where: { id: string } }): Promise<AuthUser | null>;
  };
}

type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: ExpiresIn;
  refreshTtl: ExpiresIn;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly lookup: UserLookup,
    private readonly jwt: JwtService,
    private readonly config: AuthConfig,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.lookup.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return null;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return null;
    }
    return user;
  }

  private accessOpts(): JwtSignOptions {
    return { secret: this.config.accessSecret, expiresIn: this.config.accessTtl };
  }

  async login(user: AuthUser): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, organizationId: user.organizationId, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, this.accessOpts());
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      { secret: this.config.refreshSecret, expiresIn: this.config.refreshTtl },
    );
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.refreshSecret,
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const user = await this.lookup.user.findFirst({ where: { id: sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no válido');
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, organizationId: user.organizationId, role: user.role },
      this.accessOpts(),
    );
    return { accessToken };
  }
}
