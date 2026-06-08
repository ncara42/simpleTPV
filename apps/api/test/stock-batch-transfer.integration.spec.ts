// Integración de #138: en un traspaso de un producto con lote, el lote + caducidad
// VIAJA del origen al destino (salida FEFO del origen → recrea los mismos lotes en
// destino con su caducidad). Cuadre Stock == Σ StockBatch en ambas tiendas; el exceso
// en recepción entra sin lote. Envío/recepción por el servicio real (cableado
// end-to-end). Requiere Postgres + seed + DATABASE_URL/DATABASE_URL_APP.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { withTenantTx } from '../src/prisma/with-tenant-tx.js';
import { StockService } from '../src/stock/stock.service.js';
import { TransfersService } from '../src/transfers/transfers.service.js';

describe('Traspaso con lote (#138) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let stock: StockService;
  let transfers: TransfersService;
  let org1Id: string;
  let originId: string; // store origen
  let destId: string; // store destino
  let userId: string;
  let productId: string; // tracksBatch

  async function batches(storeId: string) {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      prisma.stockBatch.findMany({ where: { productId, storeId }, orderBy: { lotCode: 'asc' } }),
    );
  }
  async function aggregateStock(storeId: string): Promise<number> {
    const row = await tenantStorage.run({ organizationId: org1Id }, async () =>
      prisma.stock.findFirst({ where: { productId, storeId } }),
    );
    return Number(row?.quantity ?? 0);
  }
  function qtyOf(rows: Array<{ lotCode: string; quantity: unknown }>, lot: string): number {
    return Number(rows.find((b) => b.lotCode === lot)?.quantity ?? 0);
  }
  function sumBatches(rows: Array<{ quantity: unknown }>): number {
    return rows.reduce((acc, b) => acc + Number(b.quantity), 0);
  }
  function expiryOf(rows: Array<{ lotCode: string; expiryDate: Date | null }>, lot: string) {
    return rows
      .find((b) => b.lotCode === lot)
      ?.expiryDate?.toISOString()
      .slice(0, 10);
  }
  async function receiveLot(lotCode: string, qty: number, expiry: string) {
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: originId,
        type: 'PURCHASE_RECEIPT',
        quantity: qty,
        batch: { lotCode, expiryDate: new Date(expiry) },
      }),
    );
  }
  async function doTransfer(sentQty: number, receivedQty: number) {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.create(
        {
          originStoreId: originId,
          destStoreId: destId,
          lines: [{ productId, quantitySent: sentQty }],
        },
        userId,
      ),
    );
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.send(created.id, userId),
    );
    const lineId = created.lines[0]!.id;
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.receive(
        created.id,
        { lines: [{ lineId, quantityReceived: receivedQty }] },
        userId,
        'ADMIN',
      ),
    );
    return created.id;
  }

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
    transfers = new TransfersService(prisma as unknown as PrismaService, base, stock);

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
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    originId = s[0]!.id;
    destId = s[1]!.id;
    const u = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    userId = u[0]!.id;

    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","tracksBatch","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'TRANSFER-LOTE-138', 10, 5, 21, true, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;

    // Stock inicial en el ORIGEN: L-EARLY (caduca antes) 3, L-LATE 10.
    await receiveLot('L-LATE', 10, '2027-01-01');
    await receiveLot('L-EARLY', 3, '2026-06-01');
  });

  afterAll(async () => {
    const transferIds = (
      await admin.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT "transferId"::text AS id FROM "TransferLine" WHERE "productId" = ${productId}::uuid
      `
    ).map((r) => r.id);
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "TransferLine" WHERE "productId" = ${productId}::uuid`;
    if (transferIds.length) {
      await admin.$executeRaw`DELETE FROM "Transfer" WHERE id = ANY(${transferIds}::uuid[])`;
    }
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('el lote + caducidad viaja del origen al destino; Stock == Σ lotes en ambas tiendas', async () => {
    // Traspasa 5 (recibido == enviado). FEFO del origen: 3 de L-EARLY + 2 de L-LATE.
    await doTransfer(5, 5);

    // ORIGEN: L-EARLY agotado, L-LATE 8; cuadre.
    const origin = await batches(originId);
    expect(qtyOf(origin, 'L-EARLY')).toBe(0);
    expect(qtyOf(origin, 'L-LATE')).toBe(8);
    expect(await aggregateStock(originId)).toBe(sumBatches(origin));

    // DESTINO: recrea L-EARLY (3) y L-LATE (2) con SU MISMA caducidad; cuadre.
    const dest = await batches(destId);
    expect(qtyOf(dest, 'L-EARLY')).toBe(3);
    expect(qtyOf(dest, 'L-LATE')).toBe(2);
    expect(expiryOf(dest, 'L-EARLY')).toBe('2026-06-01'); // la caducidad viajó
    expect(expiryOf(dest, 'L-LATE')).toBe('2027-01-01');
    expect(await aggregateStock(destId)).toBe(5);
    expect(await aggregateStock(destId)).toBe(sumBatches(dest));
  });

  it('exceso en recepción (recibido > enviado): el sobrante entra sin lote en destino', async () => {
    // Estado origen: L-LATE 8 (L-EARLY 0). Traspasa 2 (FEFO → 2 de L-LATE), recibe 3.
    const destLateBefore = qtyOf(await batches(destId), 'L-LATE');
    const destAggBefore = await aggregateStock(destId);

    await doTransfer(2, 3); // 1 de exceso

    const dest = await batches(destId);
    // El lote enviado (L-LATE) recupera lo enviado (+2); el exceso (1) NO crea lote.
    expect(qtyOf(dest, 'L-LATE')).toBe(destLateBefore + 2);
    // Stock destino sube por los 3 recibidos; Σ lotes solo por los 2 con lote →
    // desviación de exactamente el exceso (1) que entró sin lote.
    expect(await aggregateStock(destId)).toBe(destAggBefore + 3);
    expect(await aggregateStock(destId)).toBe(sumBatches(dest) + 1);
  });
});
