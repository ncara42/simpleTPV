// Integración del CIERRE Z (#124): crea ventas reales del día y verifica que el
// informe agrega correctamente totales, desglose de IVA y método de pago, con RLS
// real. Requiere Postgres (ver docs/roadmap-post-mvp.md §3).
//
// Env: DATABASE_URL (superuser) para descubrir IDs/abrir caja en el setup;
// DATABASE_URL_APP (rol app) para RLS.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { ZReportService } from '../src/z-report/z-report.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Cierre Z — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let sales: SalesService;
  let zReport: ZReportService;
  let org1Id: string;
  let store1Id: string;
  let product1Id: string;
  let user1Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    sales = new SalesService(
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
    zReport = new ZReportService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const orgRows = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    if (orgRows.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = orgRows[0]!.id;

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

    // Caja obligatoria: abrimos una OPEN en store1 para poder crear ventas.
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

  it('agrega ventas del día con desglose de IVA y método de pago coherentes (#124)', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const created = await tenantStorage.run({ organizationId: org1Id }, async () => {
      const a = await sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
      const b = await sales.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
      return { a, b };
    });

    const z = await tenantStorage.run({ organizationId: org1Id }, () =>
      zReport.getZReport(store1Id, today, user1Id, 'ADMIN'),
    );

    // Al menos las 2 ventas que acabamos de crear (la BD puede tener más del día).
    expect(z.ticketCount).toBeGreaterThanOrEqual(2);
    expect(z.store.id).toBe(store1Id);

    // El desglose de IVA cuadra con el total: Σ(base+cuota) = total.
    expect(z.taxBreakdown.length).toBeGreaterThan(0);
    const sumIva = z.taxBreakdown.reduce((acc, t) => acc + Number(t.base) + Number(t.cuota), 0);
    expect(sumIva).toBeCloseTo(Number(z.total), 2);

    // El desglose por método de pago también suma el total e incluye CASH y CARD.
    const methods = z.paymentBreakdown.map((p) => p.paymentMethod);
    expect(methods).toContain('CASH');
    expect(methods).toContain('CARD');
    const sumPay = z.paymentBreakdown.reduce((acc, p) => acc + Number(p.total), 0);
    expect(sumPay).toBeCloseTo(Number(z.total), 2);

    // El rango de numeración cubre los tickets creados.
    expect(z.firstTicketNumber).not.toBeNull();
    expect(z.lastTicketNumber).not.toBeNull();
    const numbers = [created.a.ticketNumber, created.b.ticketNumber].sort();
    expect(z.lastTicketNumber! >= numbers[1]!).toBe(true);
  });

  it('día sin ventas: informe a cero', async () => {
    const z = await tenantStorage.run({ organizationId: org1Id }, () =>
      zReport.getZReport(store1Id, '2020-01-01', user1Id, 'ADMIN'),
    );
    expect(z.ticketCount).toBe(0);
    expect(z.total).toBe(0);
    expect(z.taxBreakdown).toEqual([]);
    expect(z.paymentBreakdown).toEqual([]);
  });
});
