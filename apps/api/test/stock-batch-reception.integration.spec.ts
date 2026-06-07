// Integración del Slice 2 de #126: la recepción de un producto con lote crea/
// incrementa su StockBatch y graba el batchId en el movimiento, manteniendo el
// cuadre Stock(agregado) == Σ StockBatch. Requiere Postgres + seed.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { withTenantTx } from '../src/prisma/with-tenant-tx.js';
import { StockService } from '../src/stock/stock.service.js';

describe('Recepción con lote (#126) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let stock: StockService;
  let org1Id: string;
  let store1Id: string;
  let productId: string; // producto desechable con tracksBatch

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

    // Producto desechable con tracksBatch para aislar el test (se borra en afterAll).
    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","tracksBatch","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'BATCH-TEST-126', 10, 5, 21, true, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;
  });

  afterAll(async () => {
    // Orden FK: movimientos → lotes → stock → producto.
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('recibir un lote crea el StockBatch, incrementa Stock y graba batchId; misma reposición acumula', async () => {
    // Primera recepción del lote L-A (10 uds, caduca 2027-01-01).
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: 10,
        batch: { lotCode: 'L-A', expiryDate: new Date('2027-01-01') },
      }),
    );
    // Segunda recepción del MISMO lote (5 uds) → acumula en el mismo StockBatch.
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: 5,
        batch: { lotCode: 'L-A' },
      }),
    );
    // Recepción de OTRO lote L-B (3 uds).
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: 3,
        batch: { lotCode: 'L-B', expiryDate: new Date('2026-12-01') },
      }),
    );

    const batches = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stockBatch.findMany({ where: { productId }, orderBy: { lotCode: 'asc' } });
    });
    expect(batches.map((b) => b.lotCode)).toEqual(['L-A', 'L-B']);
    expect(Number(batches.find((b) => b.lotCode === 'L-A')!.quantity)).toBe(15);
    expect(Number(batches.find((b) => b.lotCode === 'L-B')!.quantity)).toBe(3);
    // La caducidad original de L-A SOBREVIVE a la 2ª recepción (sin fecha): la
    // reposición del mismo lote no debe borrar la caducidad (regresión #126).
    expect(
      batches
        .find((b) => b.lotCode === 'L-A')!
        .expiryDate?.toISOString()
        .slice(0, 10),
    ).toBe('2027-01-01');

    // Stock agregado == Σ lotes (15 + 3 = 18).
    const agg = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stock.findFirst({ where: { productId, storeId: store1Id } });
    });
    const sumBatches = batches.reduce((acc, b) => acc + Number(b.quantity), 0);
    expect(Number(agg!.quantity)).toBe(18);
    expect(Number(agg!.quantity)).toBe(sumBatches);

    // Los movimientos referencian el lote afectado (trazabilidad lote → movimiento).
    const movements = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.stockMovement.findMany({ where: { productId } });
    });
    expect(movements).toHaveLength(3);
    expect(movements.every((m) => m.batchId !== null)).toBe(true);
  });
});
