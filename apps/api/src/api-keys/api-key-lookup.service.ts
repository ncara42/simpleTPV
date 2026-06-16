import { createHash } from 'node:crypto';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@simpletpv/db';

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  priceListId: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

// Conexión dedicada al flujo de API key (lookup + lastUsedAt). Usa app_admin
// (BYPASSRLS) vía DATABASE_URL_AUTH porque el lookup ocurre ANTES de conocer el
// tenant. NO se usa para las rutas autenticadas del API normal.
@Injectable()
export class ApiKeyLookupService implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    const url = process.env.DATABASE_URL_AUTH ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL_AUTH o DATABASE_URL requerida');
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  static hashKey(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }

  async findByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    return this.client.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        organizationId: true,
        priceListId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.client.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
