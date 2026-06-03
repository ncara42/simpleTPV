import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@simpletpv/db';

import type { RefreshTokenRecord, RefreshTokenStore, UserLookup } from './auth.service.js';

// Conexión dedicada al flujo de auth (login/refresh). Usa el rol `app_admin`
// (BYPASSRLS) vía DATABASE_URL_AUTH, porque login/refresh corren ANTES de conocer
// el tenant. NO se usa para nada más: el resto del API usa el rol `app` + RLS.
// Implementa el lookup de usuarios y el store de refresh tokens (SEC-06).
@Injectable()
export class AuthLookupService implements UserLookup, RefreshTokenStore, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    const url = process.env.DATABASE_URL_AUTH ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL_AUTH o DATABASE_URL requerida para el flujo de auth');
    }
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  get user(): UserLookup['user'] {
    return {
      findUnique: (args) => this.client.user.findUnique(args),
      findFirst: (args) => this.client.user.findFirst(args),
    };
  }

  // --- RefreshTokenStore (SEC-06) ---

  async create(data: {
    id: string;
    familyId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    await this.client.refreshToken.create({ data });
  }

  findById(id: string): Promise<RefreshTokenRecord | null> {
    return this.client.refreshToken.findUnique({
      where: { id },
      select: { id: true, familyId: true, userId: true, usedAt: true, revokedAt: true },
    });
  }

  async markUsed(id: string): Promise<boolean> {
    // Condicional + atómico: solo reclama el token si aún no estaba usado.
    const res = await this.client.refreshToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return res.count > 0;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
