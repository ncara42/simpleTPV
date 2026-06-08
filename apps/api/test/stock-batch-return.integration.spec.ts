// Integración del Slice 2 de #137: las reposiciones reingresan al LOTE ORIGINAL,
// manteniendo el invariante Stock(agregado) == Σ StockBatch. Cubre devolución con
// ticket (parcial → total), anulación de venta (void) y la desviación documentada
// de la devolución ciega (sin lote). Venta y devolución por sus servicios reales
// (cableado end-to-end). Requiere Postgres + seed + DATABASE_URL/DATABASE_URL_APP.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { withTenantTx } from '../src/prisma/with-tenant-tx.js';
import { ReturnsService } from '../src/returns/returns.service.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Devolución al lote original (#137) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let stock: StockService;
  let sales: SalesService;
  let returns: ReturnsService;
  let org1Id: string;
  let store1Id: string;
  let user1Id: string;
  let productId: string; // tracksBatch, desechable

  // Estado de lotes por código (orden por lotCode).
  async function batches() {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      prisma.stockBatch.findMany({ where: { productId }, orderBy: { lotCode: 'asc' } }),
    );
  }
  async function aggregateStock(): Promise<number> {
    const row = await tenantStorage.run({ organizationId: org1Id }, async () =>
      prisma.stock.findFirst({ where: { productId, storeId: store1Id } }),
    );
    return Number(row?.quantity ?? 0);
  }
  function qtyOf(rows: Array<{ lotCode: string; quantity: unknown }>, lot: string): number {
    return Number(rows.find((b) => b.lotCode === lot)?.quantity ?? 0);
  }
  function sumBatches(rows: Array<{ quantity: unknown }>): number {
    return rows.reduce((acc, b) => acc + Number(b.quantity), 0);
  }
  async function sell(qty: number) {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      sales.create(
        { storeId: store1Id, lines: [{ productId, qty }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      ),
    );
  }
  async function receive(lotCode: string, qty: number, expiry: string) {
    await withTenantTx(base, org1Id, (tx) =>
      stock.applyMovement(tx, {
        organizationId: org1Id,
        productId,
        storeId: store1Id,
        type: 'PURCHASE_RECEIPT',
        quantity: qty,
        batch: { lotCode, expiryDate: new Date(expiry) },
      }),
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
    returns = new ReturnsService(prisma as unknown as PrismaService, base, stock, stubVerifactu());

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
    const u = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = u[0]!.id;

    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","tracksBatch","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'RETURN-LOTE-137', 10, 5, 21, true, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;

    // Caja OPEN obligatoria para vender (una por tienda).
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND "storeId" = ${store1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`
      INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store1Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
    `;

    // Dos lotes: L-EARLY caduca antes (se consume primero por FEFO), L-LATE después.
    await receive('L-LATE', 10, '2027-01-01');
    await receive('L-EARLY', 3, '2026-06-01');
  });

  afterAll(async () => {
    // Orden FK-safe (hijos antes que padres). Capturamos ids de Return/Sale ANTES de
    // borrar sus líneas (que son las que enlazan con el producto).
    const retIds = (
      await admin.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT "returnId"::text AS id FROM "ReturnLine" WHERE "productId" = ${productId}::uuid
      `
    ).map((r) => r.id);
    const saleIds = (
      await admin.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT "saleId"::text AS id FROM "SaleLine" WHERE "productId" = ${productId}::uuid
      `
    ).map((r) => r.id);

    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND "storeId" = ${store1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`DELETE FROM "StockMovement" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "ReturnLine" WHERE "productId" = ${productId}::uuid`;
    if (retIds.length) {
      await admin.$executeRaw`DELETE FROM "Return" WHERE id = ANY(${retIds}::uuid[])`;
    }
    await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "SaleLine" WHERE "productId" = ${productId}::uuid`;
    if (saleIds.length) {
      await admin.$executeRaw`DELETE FROM "Sale" WHERE id = ANY(${saleIds}::uuid[])`;
    }
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('venta FEFO + devolución (parcial → total) reingresa al lote original; Stock == Σ lotes', async () => {
    // Estado inicial: L-EARLY 3, L-LATE 10 (Σ 13).
    expect(sumBatches(await batches())).toBe(13);

    // Vende 5 → FEFO: 3 de L-EARLY (agota) + 2 de L-LATE. Σ = 8.
    const sale = await sell(5);
    const saleLine = sale.lines[0]!;
    {
      const b = await batches();
      expect(qtyOf(b, 'L-EARLY')).toBe(0);
      expect(qtyOf(b, 'L-LATE')).toBe(8);
      expect(await aggregateStock()).toBe(sumBatches(b)); // cuadre
    }

    // Devuelve 4 (parcial) → reingreso por orden de consumo capado: L-EARLY +3
    // (lo que de él salió), L-LATE +1. Σ = 12.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'parcial', lines: [{ saleLineId: saleLine.id, qty: 4 }] },
        user1Id,
        'ADMIN',
      ),
    );
    {
      const b = await batches();
      expect(qtyOf(b, 'L-EARLY')).toBe(3); // recupera lo suyo, no más
      expect(qtyOf(b, 'L-LATE')).toBe(9);
      expect(await aggregateStock()).toBe(12);
      expect(await aggregateStock()).toBe(sumBatches(b)); // cuadre
    }

    // Devuelve el 1 restante → solo cabe en L-LATE (L-EARLY ya recuperó sus 3).
    // Devolución TOTAL: vuelve al estado original L-EARLY 3, L-LATE 10.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'resto', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
        user1Id,
        'ADMIN',
      ),
    );
    {
      const b = await batches();
      expect(qtyOf(b, 'L-EARLY')).toBe(3);
      expect(qtyOf(b, 'L-LATE')).toBe(10);
      expect(await aggregateStock()).toBe(13);
      expect(await aggregateStock()).toBe(sumBatches(b)); // cuadre tras reversión total
    }
  });

  it('anulación de venta (void) revierte el consumo al lote original; Stock == Σ lotes', async () => {
    // Estado tras el test anterior: L-EARLY 3, L-LATE 10 (Σ 13).
    const sale = await sell(3); // FEFO: 3 de L-EARLY (agota). Σ 10.
    expect(qtyOf(await batches(), 'L-EARLY')).toBe(0);

    await tenantStorage.run({ organizationId: org1Id }, async () =>
      sales.voidSale(sale.id, user1Id),
    );

    const b = await batches();
    // La anulación revierte el consumo: L-EARLY vuelve a 3.
    expect(qtyOf(b, 'L-EARLY')).toBe(3);
    expect(qtyOf(b, 'L-LATE')).toBe(10);
    expect(await aggregateStock()).toBe(13);
    expect(await aggregateStock()).toBe(sumBatches(b)); // cuadre tras anulación
  });

  it('devolución ciega (sin ticket): reingreso SIN lote (D6a) — Stock sube, lotes intactos', async () => {
    const { default: bcrypt } = await import('bcryptjs');
    const pinHash = await bcrypt.hash('4321', 10);
    await admin.$executeRaw`UPDATE "User" SET "pinHash" = ${pinHash} WHERE email = 'manager@org1.test'`;

    const before = await batches();
    const aggBefore = await aggregateStock();

    await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.createBlind(
        {
          storeId: store1Id,
          reason: 'sin ticket',
          managerPin: '4321',
          lines: [{ productId, qty: 2 }],
        },
        user1Id,
        'ADMIN',
      ),
    );

    const after = await batches();
    // Los lotes NO cambian (reingreso sin lote): la suma de lotes se mantiene.
    expect(sumBatches(after)).toBe(sumBatches(before));
    // El Stock agregado SÍ sube por la devolución → desviación documentada del cuadre.
    expect(await aggregateStock()).toBe(aggBefore + 2);
  });
});
