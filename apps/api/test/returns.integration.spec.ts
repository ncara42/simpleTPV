// Test de integración de devoluciones (#15) contra Postgres real. Valida:
//   1. Devolución parcial OK: persiste el Return + sus líneas con el total correcto.
//   2. No se puede devolver más de lo vendido en una línea.
//   3. Dos devoluciones que en conjunto exceden lo vendido → la segunda falla.
//   4. No se puede devolver contra una venta anulada (VOIDED).
//   5. Aislamiento multi-tenant (RLS): org2 no devuelve contra una venta de org1.
//
// Requisitos previos idénticos a sales.integration: Postgres + migraciones + seed
// + DATABASE_URL (superuser) y DATABASE_URL_APP (rol app).

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { ReturnsService } from '../src/returns/returns.service.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Devoluciones — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let sales: SalesService;
  let returns: ReturnsService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let user1Id: string;
  let product1Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    const stock = new StockService(
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
    returns = new ReturnsService(prisma as unknown as PrismaService, base, stock);

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

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
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

    // Caja obligatoria (spec 2026-05-28-caja-obligatoria-design.md): cada venta de
    // este test (todas en store1) necesita una CashSession OPEN. La abrimos con el
    // cliente admin (bypassa RLS). Limpiamos OPEN previas para no chocar con el
    // índice único parcial "una OPEN por tienda".
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND "storeId" = ${store1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`
      INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store1Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND "storeId" = ${store1Id}::uuid AND status = 'OPEN'`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  // Crea una venta de org1 con la cantidad dada en una sola línea y la devuelve.
  async function createSale(qty: number) {
    return tenantStorage.run({ organizationId: org1Id }, async () =>
      sales.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      ),
    );
  }

  it('devolución parcial: persiste el Return con el total proporcional correcto', async () => {
    const sale = await createSale(3);
    const saleLine = sale.lines[0]!;

    const ret = await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        {
          saleId: sale.id,
          reason: 'producto defectuoso',
          lines: [{ saleLineId: saleLine.id, qty: 2 }],
        },
        user1Id,
      ),
    );

    expect(ret.lines).toHaveLength(1);
    expect(ret.reason).toBe('producto defectuoso');
    // total = neto de la línea / qty vendida * qty devuelta.
    const expected = Math.round((Number(saleLine.lineTotal) / 3) * 2 * 100) / 100;
    expect(Number(ret.total)).toBeCloseTo(expected, 2);
    expect(Number(ret.lines[0]!.qty)).toBeCloseTo(2, 2);
    expect(ret.lines[0]!.productId).toBe(product1Id);

    // Persistido y visible vía list bajo el tenant.
    const list = await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.list(sale.id),
    );
    expect(list.some((r) => r.id === ret.id)).toBe(true);
  });

  it('no se puede devolver más de lo vendido en una línea', async () => {
    const sale = await createSale(2);
    const saleLine = sale.lines[0]!;

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        returns.create(
          { saleId: sale.id, reason: 'exceso', lines: [{ saleLineId: saleLine.id, qty: 3 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);
  });

  it('dos devoluciones que en conjunto exceden: la segunda falla', async () => {
    const sale = await createSale(3);
    const saleLine = sale.lines[0]!;

    // Primera devolución: 2 de 3 → OK.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'primera', lines: [{ saleLineId: saleLine.id, qty: 2 }] },
        user1Id,
      ),
    );

    // Segunda: 2 más → disponible es 1 → falla.
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        returns.create(
          { saleId: sale.id, reason: 'segunda', lines: [{ saleLineId: saleLine.id, qty: 2 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);

    // Pero devolver la 1 disponible sí funciona.
    const ret = await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'resto', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
        user1Id,
      ),
    );
    expect(ret.lines).toHaveLength(1);
  });

  it('no se puede devolver contra una venta anulada (VOIDED)', async () => {
    const sale = await createSale(2);
    const saleLine = sale.lines[0]!;

    await tenantStorage.run({ organizationId: org1Id }, async () =>
      sales.voidSale(sale.id, user1Id),
    );

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        returns.create(
          { saleId: sale.id, reason: 'anulada', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/anulada/);
  });

  it('no se puede anular una venta que ya tiene devoluciones', async () => {
    const sale = await createSale(3);
    const saleLine = sale.lines[0]!;

    // Devolución parcial: deja la venta con un Return asociado.
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'parcial', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
        user1Id,
      ),
    );

    // Anular ahora debe fallar: dejaría un Return colgando de una venta anulada.
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => sales.voidSale(sale.id, user1Id)),
    ).rejects.toThrow(/devoluciones/);
  });

  it('aísla por tenant: org2 no puede devolver contra una venta de org1', async () => {
    const sale = await createSale(2);
    const saleLine = sale.lines[0]!;

    // Bajo org2, RLS + filtro por organizationId no ven la venta → 404.
    await expect(
      tenantStorage.run({ organizationId: org2Id }, async () =>
        returns.create(
          { saleId: sale.id, reason: 'cruzada', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow();

    // Sanity: bajo el propio tenant la devolución SÍ funciona (descarta falso negativo).
    const ret = await tenantStorage.run({ organizationId: org1Id }, async () =>
      returns.create(
        { saleId: sale.id, reason: 'propia', lines: [{ saleLineId: saleLine.id, qty: 1 }] },
        user1Id,
      ),
    );
    expect(Number(ret.total)).toBeGreaterThan(0);

    // Y org2 tampoco ve las devoluciones de org1 vía list.
    const seenByOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      returns.list(sale.id),
    );
    expect(seenByOrg2).toHaveLength(0);
  });
});
