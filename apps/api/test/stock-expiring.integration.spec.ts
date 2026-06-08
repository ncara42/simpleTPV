// Integración del Slice 4 de #126: la query expiringBatches devuelve los lotes
// caducados o próximos a caducar (caducidad computada on-read, sin cron), filtrando
// por ventana de días y respetando el aislamiento por tenant. Requiere Postgres +
// seed + DATABASE_URL/DATABASE_URL_APP.
//
// Gotcha (handoff): el callback de tenantStorage.run DEBE ser `async () => {…}` o el
// AsyncLocalStorage pierde el tenant y la extensión RLS devuelve 0 filas.
import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { StockService } from '../src/stock/stock.service.js';

describe('Caducidad de lotes (#126 slice 4) — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let admin: PrismaClient;
  let stock: StockService;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let productId: string; // producto con tracksBatch (desechable)

  // Lotes a insertar: caducidad relativa a CURRENT_DATE (días), cantidad y si esperamos
  // que aparezcan en la ventana por defecto (30 días). Márgenes holgados para no
  // depender del desfase de zona horaria entre CURRENT_DATE (DB) y new Date() (JS).
  const LOTS = [
    { lot: 'EXP-PASADO', offsetDays: -10, qty: 8, inDefaultWindow: true, status: 'expired' },
    { lot: 'EXP-PRONTO', offsetDays: 5, qty: 12, inDefaultWindow: true, status: 'expiring' },
    { lot: 'EXP-MEDIO', offsetDays: 25, qty: 4, inDefaultWindow: true, status: 'expiring' },
    { lot: 'EXP-LEJOS', offsetDays: 90, qty: 6, inDefaultWindow: false, status: 'expiring' },
    { lot: 'EXP-CERO', offsetDays: 3, qty: 0, inDefaultWindow: false, status: 'expiring' }, // sin stock
  ] as const;

  async function expiring(opts: { storeId?: string; withinDays?: number } = {}) {
    // Callback async: imprescindible para no perder el tenant (gotcha RLS).
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      stock.expiringBatches(opts),
    );
    // Aislamos a NUESTRO producto: el tenant puede tener otros lotes (otros tests).
    return rows.filter((r) => r.productId === productId);
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
    if (o1.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = o1[0]!.id;
    const o2 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
    `;
    org2Id = o2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    store1Id = stores[0]!.id;
    store2Id = stores[1]!.id;

    const created = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","name","salePrice","costPrice","taxRate","tracksBatch","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, 'EXPIRY-TEST-126', 10, 5, 21, true, now())
      RETURNING id::text
    `;
    productId = created[0]!.id;

    // Lotes con caducidad relativa a CURRENT_DATE en store1.
    for (const l of LOTS) {
      await admin.$executeRaw`
        INSERT INTO "StockBatch" ("id","organizationId","productId","storeId","lotCode","expiryDate","quantity","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${store1Id}::uuid,
          ${l.lot}, CURRENT_DATE + ${l.offsetDays}::int, ${l.qty}, now(), now())
      `;
    }
    // Lote SIN caducidad (null): no debe aparecer nunca (no tiene riesgo temporal).
    await admin.$executeRaw`
      INSERT INTO "StockBatch" ("id","organizationId","productId","storeId","lotCode","expiryDate","quantity","createdAt","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${productId}::uuid, ${store1Id}::uuid,
        'EXP-SINFECHA', NULL, 20, now(), now())
    `;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "StockBatch" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Stock" WHERE "productId" = ${productId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id = ${productId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('devuelve caducados + por-caducar dentro de la ventana, excluye lejanos/sin-stock/sin-fecha', async () => {
    const rows = await expiring();
    const lots = rows.map((r) => r.lotCode);
    // Dentro de la ventana por defecto (30 días): pasado, pronto y medio.
    expect(lots).toContain('EXP-PASADO');
    expect(lots).toContain('EXP-PRONTO');
    expect(lots).toContain('EXP-MEDIO');
    // Fuera: lejano (>30d), sin stock (qty 0) y sin caducidad (null).
    expect(lots).not.toContain('EXP-LEJOS');
    expect(lots).not.toContain('EXP-CERO');
    expect(lots).not.toContain('EXP-SINFECHA');
    expect(rows).toHaveLength(3);
  });

  it('clasifica el estado y el signo de daysToExpiry', async () => {
    const rows = await expiring();
    const pasado = rows.find((r) => r.lotCode === 'EXP-PASADO')!;
    const pronto = rows.find((r) => r.lotCode === 'EXP-PRONTO')!;
    expect(pasado.status).toBe('expired');
    expect(pasado.daysToExpiry).toBeLessThan(0);
    expect(pronto.status).toBe('expiring');
    expect(pronto.daysToExpiry).toBeGreaterThanOrEqual(0);
    // Enriquecido con nombre de producto/tienda y cantidad numérica.
    expect(pronto.productName).toBe('EXPIRY-TEST-126');
    expect(typeof pronto.quantity).toBe('number');
    expect(pronto.quantity).toBe(12);
  });

  it('ordena por caducidad ascendente (lo más urgente primero)', async () => {
    const rows = await expiring();
    const dates = rows.map((r) => r.expiryDate);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    // El caducado va primero; el medio (más lejano de los tres) al final.
    expect(rows[0]!.lotCode).toBe('EXP-PASADO');
    expect(rows[rows.length - 1]!.lotCode).toBe('EXP-MEDIO');
  });

  it('withinDays estrecha la ventana: con 3 días solo queda el ya caducado', async () => {
    const rows = await expiring({ withinDays: 3 });
    const lots = rows.map((r) => r.lotCode);
    expect(lots).toEqual(['EXP-PASADO']);
  });

  it('filtra por tienda: store2 no tiene lotes de este producto', async () => {
    const rows = await expiring({ storeId: store2Id });
    expect(rows).toHaveLength(0);
    // store1 sí los tiene.
    expect((await expiring({ storeId: store1Id })).length).toBe(3);
  });

  it('aislamiento por tenant: org2 no ve los lotes de org1', async () => {
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      stock.expiringBatches(),
    );
    expect(fromOrg2.some((r) => r.productId === productId)).toBe(false);
  });
});
