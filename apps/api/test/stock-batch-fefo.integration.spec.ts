// Integración del Slice 3 de #126: la SALIDA por FEFO consume primero el lote que
// caduca antes (no el más antiguo de inserción), un movimiento por lote, y el
// faltante sale sin lote (no bloquea). Stock(agregado) == Σ lotes. Requiere Postgres.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { withTenantTx } from '../src/prisma/with-tenant-tx.js';
import { StockService } from '../src/stock/stock.service.js';

describe('Salida FEFO (#126) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let stock: StockService;
  let org1Id: string;
  let store1Id: string;
  let productId: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    stock = new StockService(
      prisma as unknown as PrismaService,
      new MemoryCache(),
      base,
      new InMemoryEventBus(),
    );

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para el setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const o = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    if (o.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = o[0]!.id;
    const s = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code LIMIT 1
    `;
    store1Id = s[0]!.id;
    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","tracksBatch","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'FEFO-TEST-126', 10, 5, 21, true, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;
  });

  afterAll(async () => {
    // El stock quedó negativo → applyMovement creó una StockAlert: hay que borrarla
    // (FK RESTRICT) antes que el producto.
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('consume el lote que caduca antes aunque se reciba después; el faltante sale sin lote', async () => {
    // Recibe primero el lote que caduca MÁS TARDE (L-LATE), luego el que caduca
    // ANTES (L-EARLY) → FEFO debe consumir L-EARLY primero (por caducidad, no por
    // orden de recepción).
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: 10,
        batch: { lotCode: 'L-LATE', expiryDate: new Date('2027-01-01') },
      }),
    );
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: 3,
        batch: { lotCode: 'L-EARLY', expiryDate: new Date('2026-06-01') },
      }),
    );

    // Vende 5 → FEFO: 3 de L-EARLY (agota) + 2 de L-LATE.
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyFefoOutflow(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'SALE',
        quantity: 5,
        referenceId: '00000000-0000-0000-0000-000000000001',
      }),
    );

    const after = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stockBatch.findMany({ where: { productId }, orderBy: { lotCode: 'asc' } });
    });
    expect(Number(after.find((b) => b.lotCode === 'L-EARLY')!.quantity)).toBe(0); // agotado
    expect(Number(after.find((b) => b.lotCode === 'L-LATE')!.quantity)).toBe(8); // 10 − 2

    const agg1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stock.findFirst({ where: { productId, storeId: store1Id } });
    });
    expect(Number(agg1!.quantity)).toBe(8); // 13 − 5

    // Vende 20 más → consume los 8 de L-LATE + 12 de FALTANTE sin lote.
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyFefoOutflow(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'SALE',
        quantity: 20,
        referenceId: '00000000-0000-0000-0000-000000000002',
      }),
    );

    const agg2 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stock.findFirst({ where: { productId, storeId: store1Id } });
    });
    expect(Number(agg2!.quantity)).toBe(-12); // 8 − 20 (no bloquea)

    // Hubo un movimiento de SALE sin lote (el faltante) por −12.
    const movements = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stockMovement.findMany({ where: { productId, type: 'SALE' } });
    });
    const shortfall = movements.find((m) => m.batchId === null && Number(m.quantity) === -12);
    expect(shortfall).toBeDefined();
  });
});
