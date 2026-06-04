import { randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@simpletpv/db';
import bcrypt from 'bcryptjs';

// El login opera sobre el registro completo del usuario (necesita passwordHash y
// organizationId), así que reutilizamos el tipo generado por Prisma.
export type AuthUser = User;

// Puerto mínimo para buscar usuarios durante el login. Se implementa con una
// conexión BYPASSRLS (rol `app_admin`), porque el login busca al usuario por
// email ANTES de conocer su tenant — con el rol `app` + RLS devolvería 0 filas.
export interface UserLookup {
  user: {
    findUnique(args: { where: { email: string } }): Promise<AuthUser | null>;
    findFirst(args: { where: { id: string } }): Promise<AuthUser | null>;
  };
}

// Estado de rotación de un refresh token (SEC-06). Se implementa con la misma
// conexión BYPASSRLS que el lookup de login, porque el refresh corre sin contexto
// de tenant.
export interface RefreshTokenRecord {
  id: string;
  familyId: string;
  userId: string;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface RefreshTokenStore {
  create(data: {
    id: string;
    familyId: string;
    userId: string;
    organizationId: string;
  }): Promise<void>;
  findById(id: string): Promise<RefreshTokenRecord | null>;
  // Marca el token como usado de forma ATÓMICA (solo si aún no lo estaba). Devuelve
  // true si esta llamada lo reclamó; false si otra ya lo había usado (carrera/reuso).
  markUsed(id: string): Promise<boolean>;
  revokeFamily(familyId: string): Promise<void>;
}

type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

// Claims del refresh JWT: sujeto + identificador único del token (jti) + familia
// de rotación (fam). El jti se persiste en RefreshToken para rotar/revocar.
interface RefreshClaims {
  sub: string;
  jti: string;
  fam: string;
}

// Hash bcrypt de una contraseña-señuelo (no es una credencial). Se usa para
// ejecutar SIEMPRE un bcrypt.compare aunque el usuario no exista/esté inactivo,
// igualando el tiempo de respuesta y evitando la enumeración de cuentas por
// timing (SEC-14). Se computa una vez al cargar el módulo.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-not-a-credential', 10);

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
    private readonly tokens: RefreshTokenStore,
    private readonly jwt: JwtService,
    private readonly config: AuthConfig,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.lookup.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      // Comparación señuelo para no revelar por timing si el email existe (SEC-14).
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
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

  private signAccess(user: AuthUser): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, organizationId: user.organizationId, role: user.role },
      this.accessOpts(),
    );
  }

  // Emite un refresh token: persiste su jti en la familia dada y firma el JWT con
  // jti+fam. En login se abre una familia nueva; en la rotación se reutiliza la de
  // la sesión, de modo que un reuso revoca toda la cadena.
  private async issueRefresh(user: AuthUser, familyId: string): Promise<string> {
    const jti = randomUUID();
    await this.tokens.create({
      id: jti,
      familyId,
      userId: user.id,
      organizationId: user.organizationId,
    });
    return this.jwt.signAsync(
      { sub: user.id, jti, fam: familyId },
      { secret: this.config.refreshSecret, expiresIn: this.config.refreshTtl },
    );
  }

  async login(user: AuthUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.signAccess(user);
    const refreshToken = await this.issueRefresh(user, randomUUID());
    return { accessToken, refreshToken };
  }

  // Rota el refresh token (SEC-06): valida firma + estado en BD, detecta reuso de
  // un token ya rotado (→ revoca la familia entera) y emite un par nuevo. Devuelve
  // también un refresh token NUEVO (el anterior queda invalidado).
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: this.config.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const record = await this.tokens.findById(claims.jti);
    // Token desconocido o revocado (logout, reuso previo de la familia, etc.).
    if (!record || record.revokedAt) {
      throw new UnauthorizedException('Sesión no válida');
    }
    // Reuso de un token ya rotado → indicio de robo: revoca toda la familia.
    if (record.usedAt) {
      await this.tokens.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reutilizado; sesión revocada');
    }

    const user = await this.lookup.user.findFirst({ where: { id: record.userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no válido');
    }

    // Reclama el token de forma atómica: si otra petición concurrente lo usó antes
    // (misma carrera de reuso), revoca la familia y rechaza.
    const claimed = await this.tokens.markUsed(record.id);
    if (!claimed) {
      await this.tokens.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reutilizado; sesión revocada');
    }

    const refreshTokenNew = await this.issueRefresh(user, record.familyId);
    const accessToken = await this.signAccess(user);
    return { accessToken, refreshToken: refreshTokenNew };
  }

  // Revoca la sesión (familia) de un refresh token. Idempotente y best-effort: un
  // token inexistente/inválido no es error (el logout siempre "tiene éxito").
  async logout(refreshToken: string | null | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: this.config.refreshSecret,
      });
    } catch {
      return;
    }
    await this.tokens.revokeFamily(claims.fam);
  }
}
