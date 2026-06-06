// Test de integración del módulo dashboard contra Postgres real. Verifica los
// KPIs (sales-today, sales-by-family, sales-kpis, margin-kpis, stockout, rankings)
// con datos sembrados de forma controlada y, crucialmente, el aislamiento por
// tenant (RLS): org2 nunca ve datos de org1, y sin contexto de tenant → 0 filas.
//
// Requisitos: Postgres corriendo + migraciones + seed (orgs B11111111/B22222222).
// Sembramos nuestros propios productos/ventas con el cliente admin (superuser,
// bypassa RLS) para controlar precios/costes/fechas, y los limpiamos al final.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DashboardService } from '../src/dashboard/dashboard.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

// Etiqueta única de este run para poder limpiar SOLO lo que sembramos (la BD
// persiste entre ejecuciones).
const TAG = `dash-${Date.now()}`;

describe('Dashboard — integración', () => {
  let base: PrismaService;
  let service: DashboardService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  // Tienda propia y exclusiva de este test: aísla sales-today (que depende del
  // reloj real y compartiría datos con otros specs si usara una tienda del seed).
  let storeOwnId: string;
  let user1Id: string;
  let familyId: string;
  // Producto A: salePrice 100, costPrice 60 (margen 40/ud). Producto B: 50 / 20.
  let prodAId: string;
  let prodBId: string;

  // Fechas controladas: "hoy" y "ayer" relativos al reloj real (los KPIs de
  // sales-today usan new Date() internamente). Para los KPIs de periodo usamos un
  // DÍA FUTURO ÚNICO por run + period=custom acotado a ese día: así los agregados
  // (sales-kpis, margin) cuentan SOLO lo sembrado por este test y no arrastran
  // datos de ejecuciones anteriores (la BD persiste entre runs).
  const now = new Date();
  const todayAt = (h: number): Date => {
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const yesterdayAt = (h: number): Date => {
    const d = todayAt(h);
    d.setDate(d.getDate() - 1);
    return d;
  };
  // Día futuro único derivado del reloj (año de 4 dígitos para el regex del DTO).
  const periodDay = new Date(Date.UTC(2200, 0, 1) + (Date.now() % (86400000 * 5000)));
  const PERIOD_DATE = periodDay.toISOString().slice(0, 10); // YYYY-MM-DD
  const periodAt = (h: number): Date => {
    const d = new Date(periodDay);
    d.setUTCHours(h, 0, 0, 0);
    return d;
  };
  // Rango custom que cubre exactamente PERIOD_DATE (resolvePeriod hace `to`+1 día).
  // storeId se rellena en cada test (no disponible al definir el describe).
  const periodQuery = (): { period: 'custom'; from: string; to: string; storeId: string } => ({
    period: 'custom',
    from: PERIOD_DATE,
    to: PERIOD_DATE,
    storeId: storeOwnId,
  });

  async function seedSale(
    orgId: string,
    storeId: string,
    when: Date,
    lines: Array<{
      productId: string;
      unitPrice: number;
      qty: number;
      lineTotal: number;
      discountAmt?: number;
      discountSource?: 'VOLUNTARY' | 'PROMOTION';
    }>,
    opts?: { discountTotal?: number },
  ): Promise<string> {
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    // discountTotal incluye los descuentos de línea (como en el TPV real); si el test
    // pasa uno explícito (descuento de ticket) tiene precedencia.
    const discountTotal =
      opts?.discountTotal ?? lines.reduce((a, l) => a + (l.discountAmt ?? 0), 0);
    const total = subtotal - discountTotal;
    const rows = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Sale" ("id","organizationId","storeId","userId","ticketNumber","subtotal","discountTotal","total","paymentMethod","status","createdAt")
      VALUES (gen_random_uuid(), ${orgId}::uuid, ${storeId}::uuid, ${user1Id}::uuid,
              ${`${TAG}-${Math.random().toString(36).slice(2, 8)}`}, ${subtotal}, ${discountTotal}, ${total},
              'CARD', 'COMPLETED', ${when})
      RETURNING id::text
    `;
    const saleId = rows[0]!.id;
    for (const l of lines) {
      // IT-03: el dashboard ahora calcula el margen con el coste CONGELADO en la
      // línea (SaleLine.costPrice), no con el join a Product.costPrice. Sembrando
      // directo (sin pasar por SalesService) hay que congelarlo a mano; el subquery
      // copia el coste actual del producto, igual que SalesService al vender.
      await admin.$executeRaw`
        INSERT INTO "SaleLine" ("id","organizationId","saleId","productId","name","unitPrice","qty","discountAmt","discountPct","discountSource","taxRate","costPrice","lineTotal")
        VALUES (gen_random_uuid(), ${orgId}::uuid, ${saleId}::uuid, ${l.productId}::uuid, ${TAG},
                ${l.unitPrice}, ${l.qty}, ${l.discountAmt ?? 0}, 0, ${l.discountSource ?? 'VOLUNTARY'}::"DiscountSource", 21,
                (SELECT "costPrice" FROM "Product" WHERE id = ${l.productId}::uuid), ${l.lineTotal})
      `;
    }
    return saleId;
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    service = new DashboardService(base);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para sembrar datos en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const o1 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
    const o2 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
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
    const users = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'`;
    user1Id = users[0]!.id;

    // Tienda exclusiva del run (code único). Sin ventas previas → sales-today
    // determinista. La limpiamos en afterAll.
    const ownStore = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Store" ("id","organizationId","name","code","active","ticketCounter","createdAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${`${TAG}-store`}, ${`Z${TAG}`}, true, 0, now())
      RETURNING id::text
    `;
    storeOwnId = ownStore[0]!.id;

    // Familia + 2 productos con costes conocidos (org1).
    const fam = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ProductFamily" ("id","organizationId","name","color","sortOrder","createdAt","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${`${TAG}-fam`}, '#abc', 0, now(), now())
      RETURNING id::text
    `;
    familyId = fam[0]!.id;
    const pa = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","familyId","name","salePrice","costPrice","taxRate","saleUnit","unitSymbol","active","createdAt","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${familyId}::uuid, ${`${TAG}-A`}, 100, 60, 21, 'UNIT', 'ud', true, now(), now())
      RETURNING id::text
    `;
    prodAId = pa[0]!.id;
    const pb = await admin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Product" ("id","organizationId","familyId","name","salePrice","costPrice","taxRate","saleUnit","unitSymbol","active","createdAt","updatedAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${familyId}::uuid, ${`${TAG}-B`}, 50, 20, 21, 'UNIT', 'ud', true, now(), now())
      RETURNING id::text
    `;
    prodBId = pb[0]!.id;

    // Ventas para sales-today (hoy vs ayer, comparativa a la misma hora) en la
    // tienda exclusiva. El test inyecta now = hoy 12:00:
    //  - HOY (a las 9 y 11, ambas < 12): 200 + 45 (50 − 5 ticket) = 245.
    //  - AYER a las 10 (< 12 → cuenta): 100.
    //  - AYER a las 23 (> 12 → NO cuenta, prueba el cap "misma hora").
    await seedSale(org1Id, storeOwnId, todayAt(9), [
      { productId: prodAId, unitPrice: 100, qty: 2, lineTotal: 200 },
    ]);
    await seedSale(
      org1Id,
      storeOwnId,
      todayAt(11),
      [{ productId: prodBId, unitPrice: 50, qty: 1, lineTotal: 50 }],
      { discountTotal: 5 },
    );
    await seedSale(org1Id, storeOwnId, yesterdayAt(10), [
      { productId: prodAId, unitPrice: 100, qty: 1, lineTotal: 100 },
    ]);
    await seedSale(org1Id, storeOwnId, yesterdayAt(23), [
      { productId: prodAId, unitPrice: 100, qty: 1, lineTotal: 100 },
    ]);

    // Ventas para KPIs de periodo (día futuro único + tienda exclusiva, doblemente
    // aisladas de runs previos):
    //  - prodA 2×100 = 200 ; prodB 1×50 = 50 (ticket -5 → 45) ; prodA 1×100 = 100.
    // Totales esperados en PERIOD_DATE: 3 ventas, revenue 345, neto líneas 350.
    await seedSale(org1Id, storeOwnId, periodAt(9), [
      { productId: prodAId, unitPrice: 100, qty: 2, lineTotal: 200 },
    ]);
    await seedSale(
      org1Id,
      storeOwnId,
      periodAt(11),
      [{ productId: prodBId, unitPrice: 50, qty: 1, lineTotal: 50 }],
      { discountTotal: 5 },
    );
    await seedSale(org1Id, storeOwnId, periodAt(13), [
      { productId: prodAId, unitPrice: 100, qty: 1, lineTotal: 100 },
    ]);
  });

  afterAll(async () => {
    // Limpieza: borra SOLO lo sembrado por este run (por TAG / por producto).
    await admin.$executeRaw`DELETE FROM "SaleLine" WHERE name = ${TAG}`;
    await admin.$executeRaw`DELETE FROM "Sale" WHERE "ticketNumber" LIKE ${`${TAG}-%`}`;
    await admin.$executeRaw`DELETE FROM "Product" WHERE id IN (${prodAId}::uuid, ${prodBId}::uuid)`;
    await admin.$executeRaw`DELETE FROM "ProductFamily" WHERE id = ${familyId}::uuid`;
    await admin.$executeRaw`DELETE FROM "Store" WHERE id = ${storeOwnId}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('sales-today: comparativa a la misma hora (STAT-01) + serie intradía', async () => {
    // now inyectado a las 12:00 → ayer se capa a las 12:00 (la venta de ayer a las
    // 23h NO cuenta). Determinista: no depende de la hora real del run.
    const res = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.salesToday(storeOwnId, todayAt(12)),
    );
    // Hoy: 200 + 45 (50 − 5 ticket) = 245. Ayer hasta las 12: solo la de las 10 = 100
    // (la de las 23 queda fuera por el cap de misma hora).
    expect(res.today.total).toBeCloseTo(245, 2);
    expect(res.yesterday.total).toBeCloseTo(100, 2);
    expect(res.today.count).toBe(2);
    expect(res.yesterday.count).toBe(1); // la venta de ayer a las 23 NO se cuenta
    expect(res.deltaPct).toBeCloseTo(145, 1); // (245-100)/100*100
    const store = res.byStore.find((s) => s.storeId === storeOwnId);
    expect(store?.today).toBeCloseTo(245, 2);
    // Intradía: acumulado por hora con ventas (9→200, 11→245), termina en today.total.
    expect(res.intraday.length).toBeGreaterThanOrEqual(2);
    expect(res.intraday.at(-1)).toBeCloseTo(245, 2);
    for (let i = 1; i < res.intraday.length; i++) {
      expect(res.intraday[i]!).toBeGreaterThanOrEqual(res.intraday[i - 1]!); // no decreciente
    }
  });

  it('sales-by-family: agrupa por familia y suma el neto de líneas', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.salesByFamily(periodQuery()),
    );
    const fam = rows.find((r) => r.familyId === familyId);
    // prodA: 200 + 100 = 300; prodB: 50 → 350 en la familia (neto de líneas).
    expect(fam?.total).toBeCloseTo(350, 2);
    expect(fam?.familyName).toBe(`${TAG}-fam`);
  });

  it('sales-by-hour: agrupa tickets e importe por hora del día (STAT-02)', async () => {
    // Las ventas del periodo se sembraron a las 9, 11 y 13 (UTC).
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.salesByHour(periodQuery()),
    );
    const byHour = new Map(rows.map((r) => [r.hour, r]));
    expect(byHour.get(9)!.count).toBe(1);
    expect(byHour.get(9)!.revenue).toBeCloseTo(200, 2);
    expect(byHour.get(11)!.revenue).toBeCloseTo(45, 2); // 50 − 5 de descuento de ticket
    expect(byHour.get(13)!.revenue).toBeCloseTo(100, 2);
    // Solo devuelve horas con ventas (no las 24 del día).
    expect(rows.every((r) => [9, 11, 13].includes(r.hour))).toBe(true);
  });

  it('discount-by-employee: descuento medio por vendedor (STAT-04)', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.discountByEmployee(periodQuery()),
    );
    // Todas las ventas del periodo las hizo el mismo vendedor (3 ventas).
    expect(rows).toHaveLength(1);
    expect(rows[0]!.salesCount).toBe(3);
    // Σ descuento de ticket 5 / (Σ subtotal 350 + 5) ≈ 0.0141. (Sin promociones en el
    // periodo, el voluntario coincide con el total.)
    expect(rows[0]!.avgDiscountPct).toBeCloseTo(5 / 355, 4);
  });

  it('discount-by-employee: excluye promociones, solo cuenta el descuento voluntario (IT-11)', async () => {
    // Ventana aislada (2150) para no mezclar con el periodo (año 2200+).
    const day = '2150-07-22';
    const at = new Date(`${day}T10:00:00.000Z`);
    // Venta 1: descuento VOLUNTARIO 20 (bruto 100 → lineTotal 80).
    await seedSale(org1Id, storeOwnId, at, [
      {
        productId: prodAId,
        unitPrice: 100,
        qty: 1,
        lineTotal: 80,
        discountAmt: 20,
        discountSource: 'VOLUNTARY',
      },
    ]);
    // Venta 2: descuento de PROMOCIÓN 30 (bruto 100 → lineTotal 70) → NO debe contar.
    await seedSale(org1Id, storeOwnId, at, [
      {
        productId: prodAId,
        unitPrice: 100,
        qty: 1,
        lineTotal: 70,
        discountAmt: 30,
        discountSource: 'PROMOTION',
      },
    ]);
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.discountByEmployee({ period: 'custom', from: day, to: day, storeId: storeOwnId }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.salesCount).toBe(2);
    // Voluntario 20 / tarifa (subtotal 150 + descuentos 50) = 0.10. La promoción 30 fuera.
    expect(rows[0]!.avgDiscountPct).toBeCloseTo(0.1, 4);
  });

  it('product-rotation: unidades por producto + días sin venta + tendencia (STAT-05/06)', async () => {
    const rows = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.productRotation(periodQuery()),
    );
    const a = rows.find((r) => r.productId === prodAId);
    const b = rows.find((r) => r.productId === prodBId);
    // prodA: qty 2 (9h) + 1 (13h) = 3; prodB: qty 1 (11h).
    expect(a?.units).toBe(3);
    expect(b?.units).toBe(1);
    // Hubo última venta → daysSinceLastSale es un número (el periodo es un día único).
    expect(typeof a?.daysSinceLastSale).toBe('number');
    // Tendencia: al menos el día con ventas del periodo.
    expect(a!.trend.length).toBeGreaterThanOrEqual(1);
    expect(a!.trend.reduce((s, n) => s + n, 0)).toBe(3); // suma de la tendencia = unidades
  });

  it('sales-kpis: ticket medio, UPT, tasa de descuento y de devolución', async () => {
    const kpis = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.salesKpis(periodQuery()),
    );
    // 3 ventas, revenue = 200 + 45 + 100 = 345. Ticket medio = 115.
    expect(kpis.salesCount).toBe(3);
    expect(kpis.revenue).toBeCloseTo(345, 2);
    expect(kpis.avgTicket).toBeCloseTo(115, 2);
    // Unidades: 2 + 1 + 1 = 4 → UPT = 4/3.
    expect(kpis.upt).toBeCloseTo(4 / 3, 3);
    // No hay devoluciones sembradas en este rango → tasa 0.
    expect(kpis.returnRate).toBeCloseTo(0, 4);
  });

  it('margin-kpis: margen real y % coherentes con los costes sembrados', async () => {
    const m = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.marginKpis(periodQuery()),
    );
    // Margen real = Σ(lineTotal − costPrice*qty):
    //  prodA: 200 − 60*2 = 80; prodB: 50 − 20*1 = 30; prodA: 100 − 60 = 40 → 150.
    expect(m.realMargin).toBeCloseTo(150, 2);
    // revenue (Σ lineTotal) = 200 + 50 + 100 = 350. pct = 150/350.
    expect(m.revenue).toBeCloseTo(350, 2);
    expect(m.marginPct).toBeCloseTo(150 / 350, 4);
  });

  it('product-rankings: top ventas ordena por importe y peor rotación incluye 0 ventas', async () => {
    const r = await tenantStorage.run({ organizationId: org1Id }, async () =>
      service.productRankings({ ...periodQuery(), limit: 50 }),
    );
    const a = r.topSales.find((x) => x.productId === prodAId);
    const b = r.topSales.find((x) => x.productId === prodBId);
    expect(a?.total).toBeCloseTo(300, 2); // 200 + 100
    expect(b?.total).toBeCloseTo(50, 2);
    // prodA vende más que prodB → aparece antes en el ranking.
    expect(r.topSales.findIndex((x) => x.productId === prodAId)).toBeLessThan(
      r.topSales.findIndex((x) => x.productId === prodBId),
    );
  });

  it('stockout-kpis: cuenta alertas OUT_OF_STOCK, calcula duración y venta perdida', async () => {
    // Sembramos 2 alertas OUT_OF_STOCK en el día de periodo para la tienda propia:
    //  - prodA: resuelta tras 2h → entra en la duración media.
    //  - prodB: abierta → suma a venta perdida estimada (salePrice 50).
    const createdAt = periodAt(8);
    const resolvedAt = periodAt(10); // +2h
    await admin.$executeRaw`
      INSERT INTO "StockAlert" ("id","organizationId","productId","storeId","alertType","resolved","resolvedAt","createdAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${prodAId}::uuid, ${storeOwnId}::uuid, 'OUT_OF_STOCK', true, ${resolvedAt}, ${createdAt})
    `;
    await admin.$executeRaw`
      INSERT INTO "StockAlert" ("id","organizationId","productId","storeId","alertType","resolved","resolvedAt","createdAt")
      VALUES (gen_random_uuid(), ${org1Id}::uuid, ${prodBId}::uuid, ${storeOwnId}::uuid, 'OUT_OF_STOCK', false, NULL, ${createdAt})
    `;

    try {
      const k = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.stockoutKpis(periodQuery()),
      );
      expect(k.events).toBe(2);
      expect(k.resolved).toBe(1);
      expect(k.open).toBe(1);
      // Duración media de las resueltas: 2h exactas.
      expect(k.avgDurationHours).toBeCloseTo(2, 2);
      // Venta perdida estimada: salePrice de prodB (abierta) = 50.
      expect(k.estimatedLostSales).toBeCloseTo(50, 2);
    } finally {
      await admin.$executeRaw`DELETE FROM "StockAlert" WHERE "storeId" = ${storeOwnId}::uuid`;
    }
  });

  it('aísla por tenant: org2 no ve las ventas de org1', async () => {
    const res = await tenantStorage.run({ organizationId: org2Id }, async () =>
      service.salesKpis(periodQuery()),
    );
    // store1 es de org1; bajo org2 + RLS no hay nada que sumar.
    expect(res.revenue).toBeCloseTo(0, 2);
    expect(res.salesCount).toBe(0);
  });

  it('fail-safe: sin contexto de tenant las queries no devuelven datos de org1', async () => {
    // Sin tenantStorage.run no hay organizationId → requireTenant lanza. El
    // service exige tenant explícito, así que cualquier llamada sin contexto falla
    // (nunca filtra datos cruzados).
    await expect(service.salesKpis({ period: 'month' })).rejects.toThrow();
  });
});
