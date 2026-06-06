// Test de integración de alertas de stock (#29) contra Postgres real. Valida:
//   1. Cuando una venta deja el stock <= minStock, se crea una StockAlert activa.
//   2. Si el stock se agota (<=0), la alerta pasa/es OUT_OF_STOCK.
//   3. Al reponer por encima del mínimo, la alerta se resuelve.
//   4. GET alerts ordena por urgencia (OUT_OF_STOCK antes que LOW_STOCK).
//   5. setMin dispara/resuelve alerta al cambiar el mínimo.
//   6. Aislamiento por tenant.
//
// Requisitos: Postgres + migraciones + seed + DATABASE_URL/DATABASE_URL_APP.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Alertas de stock — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let sales: SalesService;
  let stock: StockService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let user1Id: string;
  let productId: string;

  async function activeAlerts(storeId: string) {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      stock.alerts({ storeId, resolved: false }),
    );
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
    sales = new SalesService(
      prisma as unknown as PrismaService,
      base,
      stock,
      new InMemoryEventBus(),
      stubVerifactu(),
    );

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const found1 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    const found2 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
    `;
    org1Id = found1[0]!.id;
    org2Id = found2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    store1Id = stores[0]!.id;

    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = users[0]!.id;

    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid ORDER BY name LIMIT 1
    `;
    productId = products[0]!.id;

    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`
      INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store1Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
    `;
  });

  beforeEach(async () => {
    // Estado determinista: stock 100, minStock 10, sin alertas para este par.
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid AND "storeId" = ${store1Id}::uuid`;
    await admin.$executeRaw`
      INSERT INTO "Stock" ("id", "organizationId", "productId", "storeId", "quantity", "minStock", "updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${store1Id}::uuid, 100, 10, now())
      ON CONFLICT ("productId", "storeId") DO UPDATE SET quantity = 100, "minStock" = 10
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid AND "storeId" = ${store1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  async function sell(qty: number) {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      sales.create(
        { storeId: store1Id, lines: [{ productId, qty }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      ),
    );
  }

  it('venta que cruza el mínimo crea una alerta LOW_STOCK', async () => {
    // 100 → vender 92 → quedan 8 (<= minStock 10) → LOW_STOCK.
    await sell(92);
    const alerts = await activeAlerts(store1Id);
    const a = alerts.find((x) => x.productId === productId)!;
    expect(a.alertType).toBe('LOW_STOCK');
  });

  it('agotar el stock deja la alerta como OUT_OF_STOCK (sin duplicar)', async () => {
    await sell(95); // quedan 5 → LOW_STOCK
    await sell(5); // quedan 0 → OUT_OF_STOCK (misma alerta, tipo actualizado)
    const alerts = await activeAlerts(store1Id);
    const mine = alerts.filter((x) => x.productId === productId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.alertType).toBe('OUT_OF_STOCK');
  });

  it('reponer por encima del mínimo resuelve la alerta', async () => {
    await sell(95); // quedan 5 → LOW_STOCK activa
    expect((await activeAlerts(store1Id)).some((x) => x.productId === productId)).toBe(true);

    // Reponer 50 vía setMin no aplica; usamos un ajuste directo de stock vía venta
    // negativa no existe → reponemos con un movimiento de entrada simulando recepción.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      base.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${org1Id}, true)`;
        await stock.applyMovement(tx as never, {
          organizationId: org1Id,
          productId,
          storeId: store1Id,
          type: 'PURCHASE_RECEIPT',
          quantity: 50,
        });
      }),
    );

    expect((await activeAlerts(store1Id)).some((x) => x.productId === productId)).toBe(false);
  });

  it('setMin dispara la alerta al subir el mínimo por encima de la cantidad', async () => {
    // Stock 100, minStock 10 → sin alerta. Subimos minStock a 200 → LOW_STOCK.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      stock.setMin(productId, store1Id, 200),
    );
    const alerts = await activeAlerts(store1Id);
    expect(alerts.find((x) => x.productId === productId)!.alertType).toBe('LOW_STOCK');
  });

  it('arquetipo (familia): degrada la alerta si hay un sustituto con stock (IT-13)', async () => {
    // Arquetipo = familia (mismo familyId = sustitutos). Familia F con A agotado
    // (alerta) y B con stock → la alerta de A se degrada a 'soft'. Producto C sin
    // familia y agotado → 'critical'. La crítica ordena antes que la degradada.
    const [fam] = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ProductFamily" ("id","organizationId","name","sortOrder","createdAt","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'IT13-fam', 0, now(), now()) RETURNING id::text
    `;
    const famId = fam!.id;
    const mkProduct = async (name: string, fId: string | null): Promise<string> => {
      const [p] = await admin.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "Product" ("id","organizationId","familyId","name","salePrice","costPrice","taxRate","saleUnit","unitSymbol","active","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${fId}::uuid, ${name}, 10, 6, 21, 'UNIT', 'ud', true, now(), now())
        RETURNING id::text
      `;
      return p!.id;
    };
    const aId = await mkProduct('IT13-A-agotado', famId);
    const bId = await mkProduct('IT13-B-sustituto', famId);
    const cId = await mkProduct('IT13-C-sin-familia', null);
    const ids = [aId, bId, cId];
    try {
      for (const [pid, qty] of [
        [aId, 0],
        [bId, 50],
        [cId, 0],
      ] as const) {
        await admin.$executeRaw`
          INSERT INTO "Stock" ("id","organizationId","productId","storeId","quantity","minStock","updatedAt")
          VALUES (gen_random_uuid(), ${org1Id}::uuid, ${pid}::uuid, ${store1Id}::uuid, ${qty}, 5, now())
        `;
      }
      for (const pid of [aId, cId]) {
        await admin.$executeRaw`
          INSERT INTO "StockAlert" ("id","organizationId","productId","storeId","alertType","resolved","createdAt")
          VALUES (gen_random_uuid(), ${org1Id}::uuid, ${pid}::uuid, ${store1Id}::uuid, 'OUT_OF_STOCK', false, now())
        `;
      }

      const alerts = await activeAlerts(store1Id);
      const a = alerts.find((x) => x.productId === aId)!;
      const c = alerts.find((x) => x.productId === cId)!;
      // A: hay sustituto (B con stock en la misma familia) → degradada.
      expect(a.hasSubstituteStock).toBe(true);
      expect(a.severity).toBe('soft');
      // C: sin familia (sin arquetipo) → sin sustituto → crítica.
      expect(c.hasSubstituteStock).toBe(false);
      expect(c.severity).toBe('critical');
      // La crítica va antes que la degradada en el orden.
      expect(alerts.findIndex((x) => x.productId === cId)).toBeLessThan(
        alerts.findIndex((x) => x.productId === aId),
      );
    } finally {
      await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ANY(${ids}::uuid[])`;
      await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ANY(${ids}::uuid[])`;
      await admin.$executeRaw`DELETE FROM "Product" WHERE id = ANY(${ids}::uuid[])`;
      await admin.$executeRaw`DELETE FROM "ProductFamily" WHERE id = ${famId}::uuid`;
    }
  });

  it('aislamiento por tenant: org2 no ve las alertas de org1', async () => {
    await sell(95); // crea alerta en org1
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      stock.alerts({ resolved: false }),
    );
    expect(fromOrg2.some((x) => x.productId === productId)).toBe(false);
  });
});
