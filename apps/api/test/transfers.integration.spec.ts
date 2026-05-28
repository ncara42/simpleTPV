// Test de integración de traspasos (#31) contra Postgres real. Valida el flujo
// completo crear→enviar→recibir→cerrar moviendo stock, la discrepancia, el
// rechazo de dobles transiciones y el aislamiento por tenant.
//
// Requisitos: Postgres + migraciones + seed + DATABASE_URL/DATABASE_URL_APP.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { StockService } from '../src/stock/stock.service.js';
import { TransfersService } from '../src/transfers/transfers.service.js';

describe('Traspasos — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let transfers: TransfersService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let originId: string;
  let destId: string;
  let user1Id: string;
  let productId: string;

  async function qty(storeId: string): Promise<number> {
    const rows = await admin.$queryRaw<Array<{ quantity: string }>>`
      SELECT quantity::text FROM "Stock"
      WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
    `;
    return rows.length === 0 ? 0 : Number(rows[0]!.quantity);
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    const stock = new StockService(prisma as unknown as PrismaService, new MemoryCache(), base);
    transfers = new TransfersService(prisma as unknown as PrismaService, base, stock);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const f1 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
    const f2 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
    org1Id = f1[0]!.id;
    org2Id = f2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    originId = stores[0]!.id;
    destId = stores[1]!.id;

    const users = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "User" WHERE email = 'admin@org1.test'`;
    user1Id = users[0]!.id;

    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid ORDER BY name LIMIT 1
    `;
    productId = products[0]!.id;
  });

  beforeEach(async () => {
    // Stock determinista en ambas tiendas (origen 100, destino 0) sin alertas.
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    for (const [storeId, q] of [
      [originId, 100],
      [destId, 0],
    ] as const) {
      await admin.$executeRaw`
        INSERT INTO "Stock" ("id", "organizationId", "productId", "storeId", "quantity", "minStock", "updatedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${storeId}::uuid, ${q}, 0, now())
        ON CONFLICT ("productId", "storeId") DO UPDATE SET quantity = ${q}, "minStock" = 0
      `;
    }
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('flujo completo: crear → enviar (decrementa origen) → recibir (incrementa destino) → cerrar', async () => {
    const originBefore = await qty(originId);
    const destBefore = await qty(destId);

    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.create(
        { originStoreId: originId, destStoreId: destId, lines: [{ productId, quantitySent: 30 }] },
        user1Id,
      ),
    );
    expect(created.status).toBe('DRAFT');

    // Enviar: decrementa el origen en 30.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.send(created.id, user1Id),
    );
    expect(await qty(originId)).toBeCloseTo(originBefore - 30, 3);
    expect(await qty(destId)).toBeCloseTo(destBefore, 3); // destino aún sin tocar

    // Recibir 28 de 30 (merma de 2): incrementa el destino en 28; discrepancia -2.
    const lineId = created.lines[0]!.id;
    const received = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.receive(
        created.id,
        { lines: [{ lineId, quantityReceived: 28, discrepancyNote: 'caja dañada' }] },
        user1Id,
      ),
    );
    expect(received.status).toBe('RECEIVED');
    expect(Number(received.lines[0]!.quantityReceived)).toBeCloseTo(28, 3);
    expect(Number(received.lines[0]!.discrepancy)).toBeCloseTo(-2, 3);
    expect(await qty(destId)).toBeCloseTo(destBefore + 28, 3);

    // Cerrar.
    const closed = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.close(created.id),
    );
    expect(closed.status).toBe('CLOSED');
  });

  it('no se puede recibir un traspaso en DRAFT (sin enviar)', async () => {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.create(
        { originStoreId: originId, destStoreId: destId, lines: [{ productId, quantitySent: 5 }] },
        user1Id,
      ),
    );
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        transfers.receive(
          created.id,
          { lines: [{ lineId: created.lines[0]!.id, quantityReceived: 5 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/no está en SENT/);
  });

  it('no se puede enviar dos veces (doble transición rechazada)', async () => {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.create(
        { originStoreId: originId, destStoreId: destId, lines: [{ productId, quantitySent: 10 }] },
        user1Id,
      ),
    );
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.send(created.id, user1Id),
    );
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        transfers.send(created.id, user1Id),
      ),
    ).rejects.toThrow(/no está en DRAFT/);
  });

  it('aislamiento por tenant: org2 no ve el traspaso de org1', async () => {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      transfers.create(
        { originStoreId: originId, destStoreId: destId, lines: [{ productId, quantitySent: 3 }] },
        user1Id,
      ),
    );
    await expect(
      tenantStorage.run({ organizationId: org2Id }, async () => transfers.get(created.id)),
    ).rejects.toThrow(/no encontrado/);
  });
});
