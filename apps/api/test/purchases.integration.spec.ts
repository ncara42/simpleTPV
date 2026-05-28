// Test de integración de compras (#44) contra Postgres real. Valida el CRUD de
// proveedores, crear+confirmar un pedido y el aislamiento por tenant.
//
// Requisitos: Postgres + migraciones + seed + DATABASE_URL/DATABASE_URL_APP.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';

describe('Compras — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let suppliers: SuppliersService;
  let purchases: PurchasesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let storeId: string;
  let user1Id: string;
  let productId: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    suppliers = new SuppliersService(prisma as unknown as PrismaService);
    const stock = new StockService(
      prisma as unknown as PrismaService,
      new MemoryCache(),
      base,
      new InMemoryEventBus(),
    );
    purchases = new PurchasesService(prisma as unknown as PrismaService, base, stock);

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
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code LIMIT 1
    `;
    storeId = stores[0]!.id;
    const users = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "User" WHERE email = 'admin@org1.test'`;
    user1Id = users[0]!.id;
    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    productId = products[0]!.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "PurchaseOrder" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "Supplier" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('CRUD de proveedor aislado por tenant', async () => {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.create({ name: 'Distribuidora X', leadTimeDays: 5 }),
    );
    expect(created.name).toBe('Distribuidora X');

    const list = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.findAll(),
    );
    expect(list.some((s) => s.id === created.id)).toBe(true);

    // org2 no ve el proveedor de org1.
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      suppliers.findAll(),
    );
    expect(fromOrg2.some((s) => s.id === created.id)).toBe(false);
  });

  it('crear pedido (DRAFT) y confirmarlo (CONFIRMED)', async () => {
    const supplier = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.create({ name: 'Prov Pedido' }),
    );

    const order = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.create(
        {
          supplierId: supplier.id,
          storeId,
          lines: [{ productId, quantityOrdered: 20, unitCost: 3.5 }],
        },
        user1Id,
      ),
    );
    expect(order.status).toBe('DRAFT');
    expect(order.lines).toHaveLength(1);

    const confirmed = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.confirm(order.id),
    );
    expect(confirmed.status).toBe('CONFIRMED');

    // No se puede confirmar dos veces.
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => purchases.confirm(order.id)),
    ).rejects.toThrow(/no está en DRAFT/);
  });

  it('crear pedido rechaza proveedor de otra org', async () => {
    const supplierOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      suppliers.create({ name: 'Prov Org2' }),
    );
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        purchases.create(
          { supplierId: supplierOrg2.id, storeId, lines: [{ productId, quantityOrdered: 1 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/Proveedor no encontrado/);
    await admin.$executeRaw`DELETE FROM "Supplier" WHERE "organizationId" = ${org2Id}::uuid`;
  });

  it('suggest: propone cantidad con contexto a partir de stock y ventas reales', async () => {
    // Fijamos stock bajo el mínimo y registramos ventas SALE recientes.
    await admin.$executeRaw`
      INSERT INTO "Stock" ("id", "organizationId", "productId", "storeId", "quantity", "minStock", "updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${storeId}::uuid, 2, 10, now())
      ON CONFLICT ("productId", "storeId") DO UPDATE SET quantity = 2, "minStock" = 10
    `;
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid AND type = 'SALE'`;
    // 30 unidades vendidas en los últimos días (1/día de media).
    await admin.$executeRaw`
      INSERT INTO "StockMovement" ("id", "organizationId", "productId", "storeId", "type", "quantity", "createdAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${storeId}::uuid, 'SALE', -30, now() - interval '5 days')
    `;

    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.suggest({ storeId, daysCoverage: 14 }),
    );
    const line = rows.find((r) => r.productId === productId)!;
    expect(line).toBeDefined();
    expect(line.minStock).toBe(10);
    expect(line.stockActual).toBe(2);
    expect(line.ventaMedia30d).toBe(30);
    // min 10 - stock 2 + (30/30)*14 = 22.
    expect(line.cantidadSugerida).toBeCloseTo(22, 3);

    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid AND type = 'SALE'`;
  });

  it('recepción completa incrementa el stock destino y pasa a RECEIVED con KPIs', async () => {
    // Stock conocido del destino.
    await admin.$executeRaw`
      INSERT INTO "Stock" ("id", "organizationId", "productId", "storeId", "quantity", "minStock", "updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${storeId}::uuid, 10, 0, now())
      ON CONFLICT ("productId", "storeId") DO UPDATE SET quantity = 10, "minStock" = 0
    `;
    const before = await admin.$queryRaw<Array<{ quantity: string }>>`
      SELECT quantity::text FROM "Stock" WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
    `;
    const qtyBefore = Number(before[0]!.quantity);

    const supplier = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.create({ name: 'Prov Recep' }),
    );
    const order = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.create(
        { supplierId: supplier.id, storeId, lines: [{ productId, quantityOrdered: 15 }] },
        user1Id,
      ),
    );
    await tenantStorage.run({ organizationId: org1Id }, async () => purchases.confirm(order.id));

    const lineId = order.lines[0]!.id;
    const received = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.receive(order.id, { lines: [{ lineId, quantityReceived: 15 }] }, user1Id),
    );
    expect(received.status).toBe('RECEIVED');

    const after = await admin.$queryRaw<Array<{ quantity: string }>>`
      SELECT quantity::text FROM "Stock" WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
    `;
    expect(Number(after[0]!.quantity)).toBeCloseTo(qtyBefore + 15, 3);

    // KPIs: fill rate 1 (recibido todo), lead time definido.
    const detail = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.get(order.id),
    );
    expect(detail.kpis.fillRate).toBe(1);
    expect(detail.kpis.leadTimeDays).not.toBeNull();
  });
});
