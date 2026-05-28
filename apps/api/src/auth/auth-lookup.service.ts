import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@simpletpv/db';

import type { UserLookup } from './auth.service.js';

// Conexión dedicada al lookup de login. Usa el rol `app_admin` (BYPASSRLS) vía
// DATABASE_URL_AUTH, porque el login busca al usuario por email antes de conocer
// su tenant. NO se usa para nada más: el resto del API usa el rol `app` + RLS.
@Injectable()
export class AuthLookupService implements UserLookup, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    const url = process.env.DATABASE_URL_AUTH ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL_AUTH o DATABASE_URL requerida para el lookup de login');
    }
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  get user(): UserLookup['user'] {
    return {
      findUnique: (args) => this.client.user.findUnique(args),
      findFirst: (args) => this.client.user.findFirst(args),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
