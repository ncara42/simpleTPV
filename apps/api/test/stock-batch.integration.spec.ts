// Integración del Slice 1 de #126: la tabla StockBatch respeta RLS por tenant.
// Si esto falla, la trazabilidad por lote filtraría entre organizaciones.
// Requiere Postgres + seed (org1 B11111111, org2 B22222222) + DATABASE_URL_APP (rol app).
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { withTenantTx } from '../src/prisma/with-tenant-tx.js';

const LOT = 'LOT-RLS-TEST-126';

describe('StockBatch RLS — integración (#126)', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let product1Id: string;
  let store1Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
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

    const store = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code LIMIT 1
    `;
    store1Id = store[0]!.id;
    const product = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    product1Id = product[0]!.id;

    // Limpia restos de ejecuciones previas (índice único producto/tienda/lote).
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "lotCode" = ${LOT}`;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "lotCode" = ${LOT}`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('un lote de org1 es visible bajo org1, invisible bajo org2 y sin contexto (fail-safe)', async () => {
    // Crea el lote como lo hará producción: dentro de withTenantTx (set_config en la
    // misma tx), igual que applyMovement. Verifica de paso que RLS WITH CHECK admite
    // la inserción del propio tenant.
    const created = await withTenantTx(base, org1Id, (tx) =>
      tx.stockBatch.create({
        data: {
          organizationId: org1Id,
          productId: product1Id,
          storeId: store1Id,
          lotCode: LOT,
          expiryDate: new Date('2027-01-01'),
          quantity: 10,
        },
      }),
    );

    // org1 lo ve. NOTA: el callback de tenantStorage.run DEBE ser async (return
    // dentro), si no el ALS restaura el store antes de que la extensión lea el
    // tenant (gotcha documentado en sales.integration.spec) → contexto perdido.
    const underOrg1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stockBatch.findMany({ where: { lotCode: LOT } });
    });
    expect(underOrg1.some((b) => b.id === created.id)).toBe(true);

    // org2 NO lo ve (RLS aísla por tenant).
    const underOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.stockBatch.findMany({ where: { lotCode: LOT } });
    });
    expect(underOrg2).toEqual([]);

    // Sin contexto de tenant → 0 filas (fail-safe).
    const noCtx = await prisma.stockBatch.findMany({ where: { lotCode: LOT } });
    expect(noCtx).toEqual([]);
  });
});
