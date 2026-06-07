// Integración del EXPORT CONTABLE (#125): crea ventas reales y verifica que el
// libro de IVA repercutido (formato largo) se genera con desglose correcto vía el
// pipeline de SalesExport (sin Redis → procesado síncrono). Requiere Postgres.
//
// Env: DATABASE_URL (superuser) para el setup; DATABASE_URL_APP (rol app) para RLS.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';
import { SalesExportService } from '../src/sales/sales-export.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Export contable (libro de IVA) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let sales: SalesService;
  let exportsSvc: SalesExportService;
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
    // NO llamamos onModuleInit() → sin cola Redis → requestExport procesa síncrono.
    exportsSvc = new SalesExportService(prisma as unknown as PrismaService, sales);

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

    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`
      INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store1Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "SalesExport" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('genera el libro de IVA con desglose que cuadra y filename libro-iva.csv (#125)', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const created = await tenantStorage.run({ organizationId: org1Id }, async () => {
      await sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
      await sales.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
      // Venta con descuento de ticket: ejercita el prorrateo end-to-end.
      const discounted = await sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CARD',
          ticketDiscountPct: 15,
        },
        user1Id,
        'ADMIN',
      );
      return { discounted };
    });

    // Sin Redis, requestExport procesa en el momento → COMPLETED.
    const { id, status } = await tenantStorage.run({ organizationId: org1Id }, () =>
      exportsSvc.requestExport({ from: today, to: today }, user1Id, 'ADMIN', 'accounting'),
    );
    expect(status).toBe('COMPLETED');

    const { csv, filename } = await tenantStorage.run({ organizationId: org1Id }, () =>
      exportsSvc.downloadCsv(id),
    );

    expect(filename).toBe('libro-iva.csv');
    const rows = csv.split('\n');
    expect(rows[0]).toBe('fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total');
    expect(rows.length).toBeGreaterThanOrEqual(4); // cabecera + al menos 3 facturas

    // Agrupa por nº de factura y suma base+cuota: debe cuadrar con el total de la
    // factura (la columna `total` se repite por fila). Cubre el prorrateo del
    // descuento de la venta con ticketDiscountPct.
    const byInvoice = new Map<string, { sum: number; total: number }>();
    for (const row of rows.slice(1)) {
      const cols = row.split(',');
      const numero = cols[1]!;
      const tipo = Number(cols[4]);
      const base = Number(cols[5]);
      const cuota = Number(cols[6]);
      const total = Number(cols[7]);
      expect(base).toBeGreaterThan(0);
      if (tipo > 0) {
        // cuota ≈ base * tipo/100 (con tolerancia de redondeo a céntimo).
        expect(cuota).toBeCloseTo(Math.round(base * tipo) / 100, 1);
      }
      const acc = byInvoice.get(numero) ?? { sum: 0, total };
      acc.sum += base + cuota;
      byInvoice.set(numero, acc);
    }
    for (const { sum, total } of byInvoice.values()) {
      expect(sum).toBeCloseTo(total, 2);
    }

    // La factura con descuento de ticket está en el libro y cuadra.
    expect(byInvoice.has(created.discounted.ticketNumber)).toBe(true);
  });
});
