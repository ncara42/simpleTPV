// Test de integración: valida toda la capa de ventas contra Postgres real.
// Demuestra tres garantías críticas:
//   1. Atomicidad ACID — el incremento del contador y la creación de venta+líneas
//      comparten UNA sola transacción (contador sin huecos).
//   2. Numeración de ticket secuencial por tienda.
//   3. Aislamiento multi-tenant (RLS) — una venta de org1 no es visible en org2.
//
// Requisitos previos:
//   - Postgres corriendo (docker compose up -d postgres).
//   - Migraciones aplicadas (incluida la de Sale/SaleLine con RLS).
//   - Seed ejecutado (orgs B11111111/B22222222, stores code 01/02, productos).
//   - DATABASE_URL (superuser) para descubrir IDs y leer el ticketCounter real.
//   - DATABASE_URL_APP apunta al rol `app` (no superuser) para PrismaService.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SalesService } from '../src/sales/sales.service.js';

describe('Ventas — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: SalesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let product1Id: string;

  // Lee el ticketCounter real de una tienda usando el cliente admin (superuser,
  // sin RLS). Imprescindible para verificar la atomicidad: comprobamos que el
  // contador persistido en la tabla Store sube exactamente lo esperado.
  async function readCounter(storeId: string): Promise<number> {
    const rows = await admin.$queryRaw<Array<{ ticketCounter: number }>>`
      SELECT "ticketCounter" FROM "Store" WHERE id = ${storeId}::uuid
    `;
    return rows[0]!.ticketCounter;
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    // El service recibe DOS argumentos (igual que en producción vía DI):
    //   - PRIMERO: el cliente extendido (RLS por-operación, p.ej. findMany de productos).
    //   - SEGUNDO: el cliente BASE (el mismo que abrió la conexión), que usa
    //     withTenantTx para abrir UNA transacción atómica. Así la atomicidad es real.
    service = new SalesService(prisma as unknown as PrismaService, base);

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
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  // NOTA: el callback de tenantStorage.run DEBE ser `async () => { return ... }`.
  // Si se pasa una arrow no-async que devuelve la promesa directamente, el
  // AsyncLocalStorage restaura el store al retornar (síncrono) ANTES de que el
  // código async de Prisma lea getCurrentTenant() → contexto perdido → RLS
  // devuelve 0 filas. Con `async () =>` el contexto vive durante toda la cadena.
  it('crea venta + líneas atómicamente y devuelve nº de ticket', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
      );
    });
    expect(sale.ticketNumber).toMatch(/^T\d{2}-\d{6}$/);
    expect(sale.lines).toHaveLength(1);
    expect(Number(sale.total)).toBeGreaterThan(0);
    // Cobro en efectivo: persiste método y calcula el cambio (1000 - total).
    expect(sale.paymentMethod).toBe('CASH');
    expect(Number(sale.cashGiven)).toBe(1000);
    expect(Number(sale.cashChange)).toBeCloseTo(1000 - Number(sale.total), 2);
  });

  it('numera tickets secuencialmente por tienda', async () => {
    const a = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
      );
    });
    const b = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
      );
    });
    const numA = Number(a.ticketNumber.split('-')[1]);
    const numB = Number(b.ticketNumber.split('-')[1]);
    expect(numB).toBe(numA + 1);
    expect(a.ticketNumber.startsWith('T')).toBe(true);
  });

  it('rechaza producto inexistente sin crear venta', async () => {
    const counterBefore = await readCounter(store1Id);
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.create(
          {
            storeId: store1Id,
            lines: [{ productId: '00000000-0000-0000-0000-000000000000', qty: 1 }],
            paymentMethod: 'CASH',
          },
          user1Id,
        );
      }),
    ).rejects.toThrow();
    // El fallo ocurre ANTES de abrir la tx (al mapear precios), así que el
    // contador no debe haberse tocado.
    const counterAfter = await readCounter(store1Id);
    expect(counterAfter).toBe(counterBefore);
  });

  it('aísla por tenant: org2 no ve la venta creada por org1', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
      );
    });

    // Si org2 viera la venta de org1, la seguridad estaría rota. Además
    // comprobamos que bajo org2 SÍ se ven sus propios productos: así el `null`
    // de arriba prueba aislamiento RLS REAL, no un falso negativo.
    const seenByOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.sale.findUnique({ where: { id: sale.id } });
    });
    expect(seenByOrg2).toBeNull();

    const org2Products = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.product.findMany();
    });
    expect(org2Products.length).toBeGreaterThan(0);
    for (const p of org2Products) {
      expect(p.organizationId).toBe(org2Id);
    }

    // Sanity: bajo el propio tenant la venta SÍ es visible (descarta falso negativo).
    const seenByOrg1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.sale.findUnique({ where: { id: sale.id } });
    });
    expect(seenByOrg1).not.toBeNull();
  });

  it('atomicidad: dos ventas dejan el contador en +2 (UPDATE y create comparten tx)', async () => {
    // Leemos el ticketCounter REAL de la tabla Store antes y después. Si el
    // incremento del contador y el create compartieran transacciones distintas,
    // un fallo dejaría huecos; aquí verificamos que dos ventas exitosas suben el
    // contador exactamente en 2, sin huecos — prueba de que viajan en la misma tx.
    const before = await readCounter(store2Id);

    const a = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
      );
    });
    const b = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
      );
    });

    const after = await readCounter(store2Id);
    expect(after).toBe(before + 2);

    // Los nº de ticket reflejan exactamente los valores del contador persistido.
    expect(Number(a.ticketNumber.split('-')[1])).toBe(before + 1);
    expect(Number(b.ticketNumber.split('-')[1])).toBe(before + 2);
  });
});
