// Integración del Slice 1 de #127 A: la tabla StorePrice (precio retail por tienda)
// está bajo RLS por tenant — org2 no ve los overrides de org1 y sin contexto de
// tenant no se ve ninguno (fail-safe). Requiere Postgres + seed + DATABASE_URL/APP.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('StorePrice (#127 A) — RLS integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let productId: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

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
    const s = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code LIMIT 1
    `;
    store1Id = s[0]!.id;

    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'STOREPRICE-TEST-127', 10, 5, 21, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;

    // Override de precio de org1: 7.50 € en store1 (PVP del producto = 10).
    await admin.$executeRaw`
      INSERT INTO "StorePrice" ("id","organizationId","productId","storeId","price","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${store1Id}::uuid, 7.5, now())
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "StorePrice" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('org1 ve su override de precio por tienda', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      prisma.storePrice.findMany({ where: { productId } }),
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.price)).toBe(7.5);
    expect(rows[0]!.storeId).toBe(store1Id);
  });

  it('org2 NO ve el override de org1 (aislamiento por tenant)', async () => {
    const rows = await tenantStorage.run({ organizationId: org2Id }, async () =>
      prisma.storePrice.findMany({ where: { productId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('sin contexto de tenant no se ve ningún override (fail-safe)', async () => {
    const rows = await prisma.storePrice.findMany({ where: { productId } });
    expect(rows).toHaveLength(0);
  });
});
