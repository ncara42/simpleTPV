// Test de integración de Auth contra Postgres real.
//
// Requisitos previos (igual que rls.integration.spec.ts):
//   - Postgres corriendo, migraciones aplicadas, seed ejecutado.
//   - DATABASE_URL      → superuser (descubrir IDs).
//   - DATABASE_URL_APP  → rol `app` (RLS).
//
// Verifica:
//   1. login con credenciales del seed emite un access token cuyo payload
//      lleva el organizationId correcto del usuario.
//   2. El organizationId del JWT, metido en el tenant storage, hace que
//      PrismaService (con RLS) solo vea los datos de ESA org.

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../src/auth/auth.service.js';
import { AuthLookupService } from '../src/auth/auth-lookup.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('Auth integración (login + tenant desde JWT)', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let lookup: AuthLookupService;
  let auth: AuthService;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

    // El lookup de login usa DATABASE_URL_AUTH (rol app_admin, BYPASSRLS).
    lookup = new AuthLookupService();
    auth = new AuthService(lookup, new JwtService({}), {
      accessSecret: 'itest-access',
      refreshSecret: 'itest-refresh',
      accessTtl: '15m',
      refreshTtl: '7d',
    });

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
    try {
      const o1 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
      const o2 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
      if (o1.length === 0 || o2.length === 0) {
        throw new Error('Seed no ejecutado.');
      }
      org1Id = o1[0]!.id;
      org2Id = o2[0]!.id;
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    await base.onModuleDestroy();
    await lookup.onModuleDestroy();
  });

  it('login con admin@org1.test/password123 emite token con el organizationId de org1', async () => {
    const user = await auth.validateUser('admin@org1.test', 'password123');
    expect(user).not.toBeNull();
    expect(user?.organizationId).toBe(org1Id);

    const { accessToken } = await auth.login(user!);
    const payload = new JwtService({}).decode(accessToken) as Record<string, unknown>;
    expect(payload.organizationId).toBe(org1Id);
    expect(payload.role).toBe('ADMIN');
  });

  it('el organizationId del JWT aísla los datos por RLS (org1 no ve org2)', async () => {
    const user = await auth.validateUser('admin@org1.test', 'password123');
    const { accessToken } = await auth.login(user!);
    const payload = new JwtService({}).decode(accessToken) as { organizationId: string };

    // Simula lo que hace TenantContextInterceptor: corre dentro del storage.
    // El await debe ocurrir DENTRO del callback para que el AsyncLocalStorage
    // siga activo cuando la extensión de tenant lee getCurrentTenant().
    await tenantStorage.run({ organizationId: payload.organizationId }, async () => {
      const usersVisibles = await prisma.user.findMany();
      expect(usersVisibles.length).toBeGreaterThan(0);
      expect(usersVisibles.every((u) => u.organizationId === org1Id)).toBe(true);
      expect(usersVisibles.some((u) => u.organizationId === org2Id)).toBe(false);
    });
  });
});
