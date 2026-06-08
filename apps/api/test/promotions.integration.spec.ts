// Integración del módulo Promociones (#99) contra Postgres real. Demuestra:
//   1. CRUD real vía PromotionsService (create con organizationId del tenant, findAll,
//      update parcial, remove) dentro del contexto de tenant (RLS aplicada).
//   2. RLS por tenant: org2 NO ve las promociones de org1.
//
// Requisitos: Postgres + migraciones (incl. Promotion/RLS) + seed (orgs
// B11111111/B22222222) + DATABASE_URL (superuser) + DATABASE_URL_APP.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';

describe('Promociones (#99) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let promotions: PromotionsService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;

  // Prefijo para identificar y limpiar las promos creadas por estos tests.
  const PREFIX = 'IT-promo';
  const base1 = {
    conditionType: 'min_qty' as const,
    threshold: 2,
    discountType: 'percent' as const,
    discountValue: 15,
    startDate: '2026-05-20',
    endDate: '2026-06-30',
  };

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    promotions = new PromotionsService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para el setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const o1 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    const o2 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
    `;
    if (o1.length === 0 || o2.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = o1[0]!.id;
    org2Id = o2[0]!.id;
  });

  afterEach(async () => {
    for (const orgId of [org1Id, org2Id]) {
      await admin.$executeRaw`DELETE FROM "Promotion" WHERE "organizationId" = ${orgId}::uuid AND "name" LIKE ${`${PREFIX}%`}`;
    }
  });

  afterAll(async () => {
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('CRUD real: create → findAll → update parcial → remove (dentro del tenant)', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      const created = await promotions.create({ ...base1, name: `${PREFIX} A` });
      expect(created.organizationId).toBe(org1Id);
      expect(created.active).toBe(true);

      const list = await promotions.findAll();
      expect(list.some((p) => p.id === created.id)).toBe(true);

      const updated = await promotions.update(created.id, { active: false, discountValue: 20 });
      expect(updated.active).toBe(false);
      expect(Number(updated.discountValue)).toBe(20);

      await promotions.remove(created.id);
      const after = await promotions.findAll();
      expect(after.some((p) => p.id === created.id)).toBe(false);
    });
  });

  it('RLS: org2 NO ve las promociones de org1', async () => {
    // org1 crea y, en el mismo contexto de tenant (como una request real), ve la suya.
    const created = await tenantStorage.run({ organizationId: org1Id }, async () => {
      const c = await promotions.create({ ...base1, name: `${PREFIX} aislada` });
      const listOrg1 = await promotions.findAll();
      expect(listOrg1.some((p) => p.id === c.id)).toBe(true);
      return c;
    });

    // Ground-truth: la fila persiste en la org1 (vista por el superusuario, bypass RLS).
    const persisted = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Promotion" WHERE id = ${created.id}::uuid AND "organizationId" = ${org1Id}::uuid
    `;
    expect(persisted).toHaveLength(1);

    // Aislamiento por tenant: org2 NO ve la promoción de org1.
    const listOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      promotions.findAll(),
    );
    expect(listOrg2.some((p) => p.id === created.id)).toBe(false);
  });
});
