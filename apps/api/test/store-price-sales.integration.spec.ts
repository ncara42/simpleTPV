// Integración del Slice 2 de #127 A: la resolución del precio retail por tienda en
// la VENTA (el corazón money-safe). Demuestra contra Postgres real:
//   1. Sin override para (producto, tienda) → la línea usa el PVP del producto.
//   2. Con override → la línea usa el precio de la tienda.
//   3. El precio se CONGELA en SaleLine.unitPrice: cambiar el override después no
//      altera ventas pasadas (histórico auditable).
//   4. Aislamiento por tienda: un override de store1 no afecta a una venta en store2.
//   5. Aislamiento por tenant (fail-safe): bajo otra org el lookup de overrides no
//      ve los de org1, así que una venta nunca tomaría el precio de otro tenant.
//
// Requisitos: Postgres + migraciones (incl. StorePrice/RLS) + seed (orgs
// B11111111/B22222222, stores 01/02, clerk@org1.test) + DATABASE_URL (superuser) +
// DATABASE_URL_APP (rol app).
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Precio por tienda en la venta (#127 A) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: SalesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let productId: string;
  const createdSaleIds: string[] = [];

  const PVP = 10;

  // Crea una venta de una unidad del producto en la tienda dada y devuelve el
  // unitPrice congelado en la línea (leído del valor que persiste el servidor).
  async function sellOneAndReadUnitPrice(storeId: string): Promise<number> {
    const sale = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create(
        {
          storeId,
          lines: [{ productId, qty: 1 }],
          paymentMethod: 'CASH',
          cashGiven: 100,
        } as never,
        user1Id,
        'ADMIN',
      ),
    )) as { id: string; lines: Array<{ unitPrice: unknown }> };
    createdSaleIds.push(sale.id);
    return Number(sale.lines[0]!.unitPrice);
  }

  // Upsert del override (producto, tienda) con el cliente admin (bypassa RLS).
  async function setOverride(storeId: string, price: number): Promise<void> {
    await admin.$executeRaw`
      INSERT INTO "StorePrice" ("id","organizationId","productId","storeId","price","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${storeId}::uuid, ${price}, now())
      ON CONFLICT ("productId","storeId") DO UPDATE SET "price" = EXCLUDED."price", "updatedAt" = now()
    `;
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new SalesService(
      prisma as unknown as PrismaService,
      base,
      new StockService(
        prisma as unknown as PrismaService,
        new MemoryCache(),
        base,
        new InMemoryEventBus(),
      ),
      new InMemoryEventBus(),
      stubVerifactu(),
    );

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

    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = users[0]!.id;

    // Producto propio con PVP conocido (10) para asertos exactos sin depender del seed.
    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'STOREPRICE-SALES-127', ${PVP}, 4, 21, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;

    // Caja obligatoria: create exige una CashSession OPEN. Abrimos en store1 y store2.
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND "storeId" IN (${store1Id}::uuid, ${store2Id}::uuid) AND status = 'OPEN'`;
    for (const storeId of [store1Id, store2Id]) {
      await admin.$executeRaw`
        INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${storeId}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
      `;
    }
  });

  afterAll(async () => {
    if (createdSaleIds.length > 0) {
      await admin.$executeRaw`DELETE FROM "SaleLine" WHERE "productId" = ${productId}::uuid`;
      for (const id of createdSaleIds) {
        await admin.$executeRaw`DELETE FROM "Sale" WHERE id = ${id}::uuid`;
      }
    }
    // La venta creó stock/movimientos/alertas que referencian el producto (FK).
    // Hay que borrarlos antes que el producto.
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "StorePrice" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('sin override, la venta usa el PVP del producto (congelado en la línea)', async () => {
    const unitPrice = await sellOneAndReadUnitPrice(store1Id);
    expect(unitPrice).toBe(PVP);
  });

  it('con override, la venta usa el precio de la tienda y lo congela en la línea', async () => {
    await setOverride(store1Id, 7.5);
    const sale = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create(
        {
          storeId: store1Id,
          lines: [{ productId, qty: 1 }],
          paymentMethod: 'CASH',
          cashGiven: 100,
        } as never,
        user1Id,
        'ADMIN',
      ),
    )) as { id: string; lines: Array<{ unitPrice: unknown }> };
    createdSaleIds.push(sale.id);

    expect(Number(sale.lines[0]!.unitPrice)).toBe(7.5);

    // Cambiar el override DESPUÉS no altera la venta ya realizada (histórico auditable).
    await setOverride(store1Id, 6);
    const frozen = await admin.$queryRaw<Array<{ unitPrice: string }>>`
      SELECT "unitPrice"::text FROM "SaleLine" WHERE "saleId" = ${sale.id}::uuid
    `;
    expect(Number(frozen[0]!.unitPrice)).toBe(7.5);
  });

  it('aislamiento por tienda: un override de store1 no afecta a una venta en store2', async () => {
    // store1 tiene override (6 tras el test anterior); store2 no tiene ninguno.
    const unitPrice = await sellOneAndReadUnitPrice(store2Id);
    expect(unitPrice).toBe(PVP); // store2 vende al PVP, ajeno al override de store1
  });

  it('aislamiento por tenant: bajo otra org el lookup de overrides no ve los de org1 (fail-safe)', async () => {
    await setOverride(store1Id, 6);
    const rowsOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      prisma.storePrice.findMany({ where: { storeId: store1Id, productId } }),
    );
    expect(rowsOrg2).toHaveLength(0); // org2 nunca tomaría el precio de org1
  });
});
