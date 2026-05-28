// Test de integración: valida las sesiones de caja contra Postgres real.
// Garantías cubiertas:
//   1. Apertura: crea una sesión OPEN; abrir dos veces la misma tienda → error.
//   2. Cuadre al cerrar: expected = inicial + Σ(ventas CASH del turno). Las
//      ventas CARD (y las anteriores a la apertura) NO cuentan.
//   3. Doble cierre → error.
//   4. Aislamiento multi-tenant (RLS): org2 no ve/cierra la sesión de org1.
//
// Requisitos previos (igual que sales.integration):
//   - Postgres corriendo, migraciones aplicadas (incluida CashSession), seed.
//   - DATABASE_URL (superuser) para descubrir IDs.
//   - DATABASE_URL_APP apunta al rol `app` para PrismaService.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { CashSessionsService } from '../src/cash-sessions/cash-sessions.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.service.js';

describe('Sesiones de caja — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: CashSessionsService;
  let sales: SalesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let product1Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new CashSessionsService(prisma as unknown as PrismaService);
    // SalesService crea las ventas del turno (mismo patrón de dos clientes).
    sales = new SalesService(
      prisma as unknown as PrismaService,
      base,
      new StockService(prisma as unknown as PrismaService, new MemoryCache(), base),
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
    store2Id = stores[1]!.id;

    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = users[0]!.id;

    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    product1Id = products[0]!.id;
  });

  afterAll(async () => {
    // Limpiamos las sesiones creadas para no dejar cajas OPEN que rompan reruns.
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org2Id}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('abre una caja OPEN con el efectivo inicial', async () => {
    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store1Id, openingAmount: 100 }, user1Id);
    });
    expect(session.status).toBe('OPEN');
    expect(Number(session.openingAmount)).toBeCloseTo(100, 2);
    expect(session.storeId).toBe(store1Id);

    // Limpieza inmediata: cerramos para no dejar la tienda con caja abierta.
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: 100 });
    });
  });

  it('no permite abrir dos cajas en la misma tienda a la vez', async () => {
    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store2Id, openingAmount: 50 }, user1Id);
    });

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.open({ storeId: store2Id, openingAmount: 80 }, user1Id);
      }),
    ).rejects.toThrow(/Ya hay una caja abierta/);

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: 50 });
    });
  });

  it('al cerrar, expected = inicial + Σ(ventas CASH del turno); CARD no cuenta', async () => {
    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store1Id, openingAmount: 200 }, user1Id);
    });

    // Una venta en efectivo (cuenta) y una con tarjeta (NO cuenta) en la misma tienda.
    const cashSale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
    });
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return sales.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    const cashTotal = Number(cashSale.total);
    const expected = Math.round((200 + cashTotal) * 100) / 100;

    const closed = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: expected });
    });

    expect(closed.status).toBe('CLOSED');
    // Esperado = inicial + ventas efectivo (la venta CARD queda fuera).
    expect(Number(closed.expectedAmount)).toBeCloseTo(expected, 2);
    expect(Number(closed.closingAmount)).toBeCloseTo(expected, 2);
    // Cuadre exacto: diferencia 0.
    expect(Number(closed.difference)).toBeCloseTo(0, 2);
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it('refleja sobrante y faltante en la diferencia', async () => {
    const over = await tenantStorage.run({ organizationId: org1Id }, async () => {
      const s = await service.open({ storeId: store2Id, openingAmount: 100 }, user1Id);
      return service.close(s.id, { countedAmount: 110 });
    });
    // Sin ventas: expected = 100, contado 110 → sobrante +10.
    expect(Number(over.expectedAmount)).toBeCloseTo(100, 2);
    expect(Number(over.difference)).toBeCloseTo(10, 2);

    const under = await tenantStorage.run({ organizationId: org1Id }, async () => {
      const s = await service.open({ storeId: store2Id, openingAmount: 100 }, user1Id);
      return service.close(s.id, { countedAmount: 90 });
    });
    // Faltante −10.
    expect(Number(under.difference)).toBeCloseTo(-10, 2);
  });

  it('no se puede cerrar dos veces la misma caja', async () => {
    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store1Id, openingAmount: 0 }, user1Id);
    });
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: 0 });
    });

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.close(session.id, { countedAmount: 0 });
      }),
    ).rejects.toThrow(/ya está cerrada/);
  });

  it('cerrar un id inexistente lanza NotFound', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.close('00000000-0000-0000-0000-000000000000', { countedAmount: 0 });
      }),
    ).rejects.toThrow();
  });

  it('current devuelve la sesión abierta o null', async () => {
    const none = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.current(store1Id);
    });
    expect(none).toBeNull();

    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store1Id, openingAmount: 10 }, user1Id);
    });
    const current = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.current(store1Id);
    });
    expect(current?.id).toBe(session.id);
    expect(current?.status).toBe('OPEN');

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: 10 });
    });
  });

  it('aísla por tenant: org2 no puede cerrar la caja de org1', async () => {
    const session = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.open({ storeId: store1Id, openingAmount: 100 }, user1Id);
    });

    // Bajo org2, RLS + el filtro por organizationId no ven la sesión → NotFound.
    await expect(
      tenantStorage.run({ organizationId: org2Id }, async () => {
        return service.close(session.id, { countedAmount: 100 });
      }),
    ).rejects.toThrow();

    // Sanity: bajo org1 la sesión sigue OPEN (org2 no la tocó).
    const own = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.cashSession.findUnique({ where: { id: session.id } });
    });
    expect(own?.status).toBe('OPEN');

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.close(session.id, { countedAmount: 100 });
    });
  });
});
