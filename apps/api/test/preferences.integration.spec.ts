// Test de integración de preferencias de usuario (IT-16) contra Postgres real.
// Verifica set/getAll, upsert, aislamiento por usuario y por tenant (RLS) y la cota
// de tamaño. Requisitos: Postgres + migraciones (incl. UserPreference) + seed.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PreferencesService } from '../src/me/preferences.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('Preferencias de usuario (IT-16) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: PreferencesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let user1Id: string;
  let user2Id: string;

  const asUser1 = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantStorage.run({ organizationId: org1Id }, fn);

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new PreferencesService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL (superuser) requerido en setup.');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const o1 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
    const o2 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
    if (o1.length === 0 || o2.length === 0) throw new Error('Seed no ejecutado.');
    org1Id = o1[0]!.id;
    org2Id = o2[0]!.id;

    // Dos usuarios distintos de org1.
    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE "organizationId" = ${org1Id}::uuid ORDER BY email LIMIT 2
    `;
    user1Id = users[0]!.id;
    user2Id = users[1]!.id;

    await admin.$executeRaw`DELETE FROM "UserPreference" WHERE "userId" IN (${user1Id}::uuid, ${user2Id}::uuid)`;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "UserPreference" WHERE "userId" IN (${user1Id}::uuid, ${user2Id}::uuid)`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('set + getAll devuelve las preferencias del usuario como mapa key→value', async () => {
    await asUser1(() => service.set(user1Id, 'dashboard.cards', { hidden: ['kpi-upt'] }));
    const prefs = await asUser1(() => service.getAll(user1Id));
    expect(prefs['dashboard.cards']).toEqual({ hidden: ['kpi-upt'] });
  });

  it('upsert: reescribe el valor de la misma clave (único por usuario)', async () => {
    await asUser1(() => service.set(user1Id, 'dashboard.cards', { hidden: [] }));
    const prefs = await asUser1(() => service.getAll(user1Id));
    expect(prefs['dashboard.cards']).toEqual({ hidden: [] });
  });

  it('aislamiento por usuario: user2 no ve las preferencias de user1', async () => {
    const prefs2 = await asUser1(() => service.getAll(user2Id));
    expect(prefs2['dashboard.cards']).toBeUndefined();
  });

  it('aislamiento por tenant (RLS): bajo contexto org2 no se ven las de org1', async () => {
    const underOrg2 = await tenantStorage.run({ organizationId: org2Id }, () =>
      service.getAll(user1Id),
    );
    expect(underOrg2['dashboard.cards']).toBeUndefined();
  });

  it('cota de tamaño: rechaza una preferencia demasiado grande', async () => {
    const big = { blob: 'x'.repeat(20 * 1024) };
    await expect(asUser1(() => service.set(user1Id, 'big', big))).rejects.toThrow();
  });
});
