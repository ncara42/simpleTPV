// Test de integración de stock (#27) contra Postgres real. Valida:
//   1. Una venta decrementa el stock del producto en su tienda y registra un
//      StockMovement tipo SALE, todo en la transacción de la venta.
//   2. Una devolución repone el stock (movimiento RETURN).
//   3. Anular una venta repone el stock.
//   4. Aislamiento multi-tenant (RLS): el Stock de org1 no es visible en org2.
//
// Requisitos previos idénticos a sales.integration: Postgres + migraciones + seed
// + DATABASE_URL (superuser) y DATABASE_URL_APP (rol app).

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { ReturnsService } from '../src/returns/returns.service.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';

describe('Stock — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let sales: SalesService;
  let returns: ReturnsService;
  let stockService: StockService;
  let cache: MemoryCache;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let user1Id: string;
  let product1Id: string;

  // Lee la cantidad de stock de un par producto+tienda con el cliente admin
  // (superuser, sin RLS). Devuelve null si no hay fila.
  async function readQuantity(productId: string, storeId: string): Promise<number | null> {
    const rows = await admin.$queryRaw<Array<{ quantity: string }>>`
      SELECT quantity::text FROM "Stock"
      WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
    `;
    return rows.length === 0 ? null : Number(rows[0]!.quantity);
  }

  async function countMovements(productId: string, storeId: string, type: string): Promise<number> {
    const rows = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM "StockMovement"
      WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid AND type = ${type}::"MovementType"
    `;
    return Number(rows[0]!.n);
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    cache = new MemoryCache();
    stockService = new StockService(prisma as unknown as PrismaService, cache);
    sales = new SalesService(prisma as unknown as PrismaService, base, stockService);
    returns = new ReturnsService(prisma as unknown as PrismaService, base, stockService);

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
    if (found1.length === 0 || found2.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = found1[0]!.id;
    org2Id = found2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string; code: string }>>`
      SELECT id::text, code FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    store1Id = stores[0]!.id;

    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = users[0]!.id;

    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    product1Id = products[0]!.id;

    // Asegura una fila de Stock conocida para product1 en store1 (el seed la crea,
    // pero la fijamos a una cantidad determinista para no depender de runs previos).
    await admin.$executeRaw`
      INSERT INTO "Stock" ("id", "organizationId", "productId", "storeId", "quantity", "minStock", "updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${product1Id}::uuid, ${store1Id}::uuid, 100, 0, now())
      ON CONFLICT ("productId", "storeId") DO UPDATE SET quantity = 100
    `;

    // Caja obligatoria: abrir una OPEN en store1 (limpiando OPEN previas).
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`
      INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store1Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('una venta decrementa el stock y registra un movimiento SALE', async () => {
    const before = (await readQuantity(product1Id, store1Id))!;
    const salesBefore = await countMovements(product1Id, store1Id, 'SALE');

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 3 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
    });

    const after = (await readQuantity(product1Id, store1Id))!;
    expect(after).toBeCloseTo(before - 3, 3);
    expect(await countMovements(product1Id, store1Id, 'SALE')).toBe(salesBefore + 1);
  });

  it('una devolución repone el stock (movimiento RETURN)', async () => {
    // Venta de 2 uds, luego devolución de 1 ud → neto -1 sobre el stock inicial.
    const before = (await readQuantity(product1Id, store1Id))!;

    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CARD',
        },
        user1Id,
        'ADMIN',
      );
    });
    expect(await readQuantity(product1Id, store1Id)).toBeCloseTo(before - 2, 3);

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return returns.create(
        {
          saleId: sale.id,
          reason: 'cliente arrepentido',
          lines: [{ saleLineId: sale.lines[0]!.id, qty: 1 }],
        },
        user1Id,
      );
    });

    expect(await readQuantity(product1Id, store1Id)).toBeCloseTo(before - 1, 3);
    expect(await countMovements(product1Id, store1Id, 'RETURN')).toBeGreaterThan(0);
  });

  it('anular una venta repone el stock de sus líneas', async () => {
    const before = (await readQuantity(product1Id, store1Id))!;

    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 5 }],
          paymentMethod: 'CARD',
        },
        user1Id,
        'ADMIN',
      );
    });
    expect(await readQuantity(product1Id, store1Id)).toBeCloseTo(before - 5, 3);

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.voidSale(sale.id, user1Id);
    });

    // Tras anular, el stock vuelve al valor previo a la venta.
    expect(await readQuantity(product1Id, store1Id)).toBeCloseTo(before, 3);
  });

  it('aislamiento por tenant: el Stock de org1 no es visible desde org2', async () => {
    const rows = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.stock.findMany({ where: { storeId: store1Id } });
    });
    // store1 pertenece a org1; bajo el contexto de org2, RLS devuelve 0 filas.
    expect(rows).toHaveLength(0);
  });

  it('byStore: lista el stock de la tienda con nivel semáforo, aislado por tenant', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return stockService.byStore(store1Id);
    });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.productId === product1Id)!;
    expect(row.storeId).toBe(store1Id);
    expect(['red', 'yellow', 'green']).toContain(row.level);
    expect(typeof row.quantity).toBe('number');

    // Desde org2, la tienda de org1 no devuelve filas (RLS).
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return stockService.byStore(store1Id);
    });
    expect(fromOrg2).toHaveLength(0);
  });

  it('global: agrega por producto el stock de cada tienda y el total', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return stockService.global();
    });
    const entry = rows.find((r) => r.productId === product1Id)!;
    expect(entry.stores.length).toBeGreaterThan(0);
    const sum = entry.stores.reduce((acc, s) => acc + s.quantity, 0);
    expect(entry.total).toBeCloseTo(sum, 3);
  });

  it('byProduct: sirve la quantity desde cache; en miss cae a Postgres y repuebla', async () => {
    // Sembramos el cache con un valor distinto del de Postgres: byProduct debe
    // devolver el del cache (demuestra que lee de Redis/cache, no siempre de DB).
    const key = `stock:${org1Id}:${store1Id}:${product1Id}`;
    await cache.set(key, '777');

    const rows = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return stockService.byProduct(product1Id);
    });
    const row = rows.find((r) => r.storeId === store1Id)!;
    expect(row.quantity).toBe(777);

    // Miss: borramos la clave; byProduct cae a Postgres y repuebla el cache.
    await cache.del(key);
    const rows2 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return stockService.byProduct(product1Id);
    });
    const row2 = rows2.find((r) => r.storeId === store1Id)!;
    const dbQty = (await readQuantity(product1Id, store1Id))!;
    expect(row2.quantity).toBeCloseTo(dbQty, 3);
    // El cache quedó repoblado con el valor de Postgres.
    expect(await cache.get(key)).toBe(String(dbQty));
  });
});
