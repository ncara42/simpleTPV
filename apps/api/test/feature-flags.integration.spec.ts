// Integración del Slice 1 de #127 B: feature flags por tienda/organización contra
// Postgres real. Demuestra:
//   1. RLS por tenant: org2 no ve los flags de org1 → resuelve a su default de código.
//   2. Resolución real: override de tienda ?? default de org ?? default del código.
//   3. Enforcement real: con un flag de org en false, la acción del módulo (crear
//      pedido mayorista) se bloquea con 403 vía FeatureFlagService.assertEnabled.
//
// Requisitos: Postgres + migraciones (incl. FeatureFlag/RLS) + seed (orgs
// B11111111/B22222222, stores 01/02) + DATABASE_URL (superuser) + DATABASE_URL_APP.
import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { WholesaleOrdersService } from '../src/b2b/wholesale-orders.service.js';
import { FeatureFlagService } from '../src/feature-flags/feature-flags.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('Feature flags (#127 B) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let features: FeatureFlagService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;

  const KEYS = ['b2b', 'blind_returns'];

  async function setFlag(
    orgId: string,
    key: string,
    enabled: boolean,
    storeId?: string,
  ): Promise<void> {
    await admin.$executeRaw`
      INSERT INTO "FeatureFlag" ("id","organizationId","storeId","key","enabled","updatedAt")
      VALUES (gen_random_uuid(), ${orgId}::uuid, ${storeId ?? null}::uuid, ${key}, ${enabled}, now())
      ON CONFLICT ("organizationId","key","storeId") DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()
    `;
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    features = new FeatureFlagService(prisma as unknown as PrismaService);

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

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    store1Id = stores[0]!.id;
    store2Id = stores[1]!.id;
  });

  afterEach(async () => {
    // Limpia los flags de ambas orgs entre tests para aislar cada caso.
    for (const orgId of [org1Id, org2Id]) {
      await admin.$executeRaw`DELETE FROM "FeatureFlag" WHERE "organizationId" = ${orgId}::uuid AND "key" = ANY(${KEYS})`;
    }
  });

  afterAll(async () => {
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('RLS: org2 no ve el flag de org1 → resuelve a su default del código', async () => {
    await setFlag(org1Id, 'b2b', false); // org1 apaga B2B a nivel org

    const enabledOrg1 = await tenantStorage.run({ organizationId: org1Id }, async () =>
      features.isEnabled('b2b'),
    );
    const enabledOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      features.isEnabled('b2b'),
    );

    expect(enabledOrg1).toBe(false); // org1 lo apagó
    expect(enabledOrg2).toBe(true); // org2 no ve el flag de org1 → default del código
  });

  it('resolución: override de tienda ?? default de org ?? default del código', async () => {
    await setFlag(org1Id, 'blind_returns', false); // org apaga por defecto
    await setFlag(org1Id, 'blind_returns', true, store1Id); // pero store1 lo enciende

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      expect(await features.isEnabled('blind_returns', store1Id)).toBe(true); // override tienda
      expect(await features.isEnabled('blind_returns', store2Id)).toBe(false); // default de org
      expect(await features.isEnabled('time_clock', store1Id)).toBe(true); // sin fila → código
    });
  });

  it('resolveAll devuelve el estado efectivo de todas las keys', async () => {
    await setFlag(org1Id, 'b2b', false);

    const all = await tenantStorage.run({ organizationId: org1Id }, async () =>
      features.resolveAll(store1Id),
    );

    expect(all.b2b).toBe(false); // apagado por org
    expect(all.blind_returns).toBe(true); // sin fila → default del código
    expect(all.time_clock).toBe(true);
    expect(all.data_export).toBe(true);
  });

  it('enforcement real: con B2B apagado, crear pedido mayorista lanza 403', async () => {
    await setFlag(org1Id, 'b2b', false);
    const orders = new WholesaleOrdersService(prisma as unknown as PrismaService, features);

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        orders.create({ customerId: store1Id, lines: [{ productId: store1Id, qty: 1 }] } as never),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('enforcement real: con B2B encendido (sin flag), supera el gate y sigue el flujo', async () => {
    // Sin fila → default del código (activo). create pasa el assertEnabled y avanza
    // hasta la verificación del cliente, que falla por OTRA razón (cliente inexistente):
    // prueba que el feature gate NO bloqueó.
    const orders = new WholesaleOrdersService(prisma as unknown as PrismaService, features);

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        orders.create({ customerId: store1Id, lines: [{ productId: store1Id, qty: 1 }] } as never),
      ),
    ).rejects.toThrow(/Cliente no encontrado/);
  });

  it('gestión real: setFlag (crea/actualiza), list y clearFlag (vuelve al default)', async () => {
    const actor = { userId: 'admin-1', role: 'ADMIN' };
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      expect(await features.isEnabled('b2b')).toBe(true); // sin fila → default código
      await features.setFlag('b2b', false, undefined, actor); // crea org default false
      expect(await features.isEnabled('b2b')).toBe(false);
      await features.setFlag('b2b', true, undefined, actor); // actualiza la misma fila
      expect(await features.isEnabled('b2b')).toBe(true);

      const listed = await features.list();
      expect(listed.catalog).toHaveLength(4);
      expect(
        listed.flags.some((f) => f.key === 'b2b' && f.storeId === null && f.enabled === true),
      ).toBe(true);

      await features.clearFlag('b2b', undefined, actor); // quita → vuelve al default código
      expect(await features.isEnabled('b2b')).toBe(true);
      const after = await features.list();
      expect(after.flags.some((f) => f.key === 'b2b')).toBe(false);
    });
  });

  it('gestión real: override de tienda con setFlag(storeId) no afecta a otra tienda', async () => {
    const actor = { userId: 'admin-1', role: 'ADMIN' };
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      await features.setFlag('blind_returns', false, store1Id, actor);
      expect(await features.isEnabled('blind_returns', store1Id)).toBe(false);
      expect(await features.isEnabled('blind_returns', store2Id)).toBe(true); // store2 intacto
      await features.clearFlag('blind_returns', store1Id, actor);
      expect(await features.isEnabled('blind_returns', store1Id)).toBe(true);
    });
  });
});
