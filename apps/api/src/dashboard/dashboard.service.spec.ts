import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import * as txMod from '../prisma/with-tenant-tx.js';
import { DashboardService } from './dashboard.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// Mockea withTenantTx para que ejecute el callback con un `tx` falso cuyo
// $queryRaw devuelve, en orden, las filas que le pasemos. Así verificamos los
// MAPEOS y CÁLCULOS del service (ratios, conversión bigint/string→number, deltas)
// sin tocar Postgres — el SQL en sí se valida en el test de integración.
function withFakeRows(rowsInOrder: unknown[][]): { restore: () => void } {
  let call = 0;
  const tx = {
    $queryRaw: () => Promise.resolve(rowsInOrder[call++] ?? []),
  };
  const spy = vi
    .spyOn(txMod, 'withTenantTx')
    // @ts-expect-error firma simplificada para el test
    .mockImplementation((_base, _org, fn) => fn(tx, () => {}));
  return { restore: () => spy.mockRestore() };
}

function makeService(): DashboardService {
  // El service solo usa `base` para pasarlo a withTenantTx (que mockeamos), así
  // que un stub vacío basta.
  return new DashboardService({} as never);
}

const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

describe('DashboardService — mapeos y cálculos (unit)', () => {
  it('salesKpis: deriva ticket medio, UPT, tasas desde filas crudas', async () => {
    // 1ª query: agregado de ventas. 2ª query: devoluciones.
    const fake = withFakeRows([
      [{ sales_count: 4n, revenue: '400', subtotal: '380', discount: '20', units: '10' }],
      [{ returns_total: '40' }],
    ]);
    try {
      const k = await run(() => makeService().salesKpis({}));
      expect(k.salesCount).toBe(4);
      expect(k.revenue).toBe(400);
      expect(k.avgTicket).toBe(100); // 400/4
      expect(k.upt).toBe(2.5); // 10/4
      expect(k.discountRate).toBeCloseTo(20 / 400, 4); // discount/(subtotal+discount)
      expect(k.returnRate).toBeCloseTo(40 / 400, 4);
    } finally {
      fake.restore();
    }
  });

  it('salesKpis: sin ventas evita divisiones por cero', async () => {
    const fake = withFakeRows([
      [{ sales_count: 0n, revenue: '0', subtotal: '0', discount: '0', units: '0' }],
      [{ returns_total: '0' }],
    ]);
    try {
      const k = await run(() => makeService().salesKpis({}));
      expect(k.avgTicket).toBe(0);
      expect(k.upt).toBe(0);
      expect(k.discountRate).toBe(0);
      expect(k.returnRate).toBe(0);
    } finally {
      fake.restore();
    }
  });

  it('marginKpis: calcula % margen sobre revenue', async () => {
    const fake = withFakeRows([[{ gross: '200', real: '150', revenue: '350' }]]);
    try {
      const m = await run(() => makeService().marginKpis({}));
      expect(m.grossMargin).toBe(200);
      expect(m.realMargin).toBe(150);
      expect(m.revenue).toBe(350);
      expect(m.marginPct).toBeCloseTo(150 / 350, 4);
    } finally {
      fake.restore();
    }
  });

  it('salesKpis: construye las series intra-periodo por bucket', async () => {
    const bA = new Date('2026-06-09T09:00:00Z');
    const bB = new Date('2026-06-09T10:00:00Z');
    // Orden de queries: agg, devoluciones, ventas-bucket, unidades-bucket, devol-bucket.
    const fake = withFakeRows([
      [{ sales_count: 5n, revenue: '800', subtotal: '750', discount: '50', units: '18' }],
      [{ returns_total: '10' }],
      [
        { bucket: bA, count: 2n, revenue: '200', subtotal: '180', discount: '20' },
        { bucket: bB, count: 3n, revenue: '600', subtotal: '570', discount: '30' },
      ],
      [
        { bucket: bA, units: '6' },
        { bucket: bB, units: '12' },
      ],
      [{ bucket: bA, returns: '10' }], // bB sin devoluciones
    ]);
    try {
      const k = await run(() => makeService().salesKpis({}));
      expect(k.series.avgTicket).toEqual([100, 200]); // 200/2, 600/3
      expect(k.series.upt).toEqual([3, 4]); // 6/2, 12/3
      expect(k.series.discountRate).toEqual([0.1, 0.05]); // 20/200, 30/600
      expect(k.series.returnRate).toEqual([0.05, 0]); // 10/200, sin devol
    } finally {
      fake.restore();
    }
  });

  it('marginKpis: construye series de % margen y margen real por bucket', async () => {
    const bA = new Date('2026-06-09T09:00:00Z');
    const bB = new Date('2026-06-09T10:00:00Z');
    // Orden de queries: agg de margen, margen-bucket.
    const fake = withFakeRows([
      [{ gross: '200', real: '150', revenue: '350' }],
      [
        { bucket: bA, real: '50', revenue: '100' },
        { bucket: bB, real: '200', revenue: '500' },
      ],
    ]);
    try {
      const m = await run(() => makeService().marginKpis({}));
      expect(m.realMarginSeries).toEqual([50, 200]);
      expect(m.series).toEqual([0.5, 0.4]); // 50/100, 200/500
    } finally {
      fake.restore();
    }
  });

  it('stockoutKpis: convierte segundos→horas y calcula tasa', async () => {
    const fake = withFakeRows([
      [{ events: 3n, resolved: 2n, open: 1n, avg_seconds: '7200' }], // 2h
      [{ active_products: 10n }],
      [{ estimated: '99.5' }],
    ]);
    try {
      const k = await run(() => makeService().stockoutKpis({}));
      expect(k.events).toBe(3);
      expect(k.resolved).toBe(2);
      expect(k.open).toBe(1);
      expect(k.avgDurationHours).toBeCloseTo(2, 4);
      expect(k.rate).toBeCloseTo(3 / 10, 4);
      expect(k.estimatedLostSales).toBeCloseTo(99.5, 2);
    } finally {
      fake.restore();
    }
  });

  it('stockoutKpis: avg null cuando no hay resueltas', async () => {
    const fake = withFakeRows([
      [{ events: 1n, resolved: 0n, open: 1n, avg_seconds: null }],
      [{ active_products: 0n }],
      [{ estimated: '0' }],
    ]);
    try {
      const k = await run(() => makeService().stockoutKpis({}));
      expect(k.avgDurationHours).toBeNull();
      expect(k.rate).toBe(0); // sin productos activos
    } finally {
      fake.restore();
    }
  });

  it('salesByFamily: mapea "Sin familia" cuando familyName es null', async () => {
    const fake = withFakeRows([
      [
        { familyId: 'f1', familyName: 'Bebidas', color: '#00f', total: '120' },
        { familyId: null, familyName: null, color: null, total: '30' },
      ],
    ]);
    try {
      const rows = await run(() => makeService().salesByFamily({}));
      expect(rows[0]).toMatchObject({ familyName: 'Bebidas', total: 120 });
      expect(rows[1]).toMatchObject({ familyId: null, familyName: 'Sin familia', total: 30 });
    } finally {
      fake.restore();
    }
  });

  it('productRankings: mapea las tres listas a number', async () => {
    const fake = withFakeRows([
      [{ productId: 'p1', name: 'A', total: '300', units: '3' }], // topSales
      [{ productId: 'p1', name: 'A', margin: '120' }], // topMargin
      [{ productId: 'p2', name: 'B', units: '0' }], // worstRotation
    ]);
    try {
      const r = await run(() => makeService().productRankings({}));
      expect(r.topSales[0]).toMatchObject({ name: 'A', total: 300, units: 3 });
      expect(r.topMargin[0]).toMatchObject({ name: 'A', margin: 120 });
      expect(r.worstRotation[0]).toMatchObject({ name: 'B', units: 0 });
    } finally {
      fake.restore();
    }
  });

  it('salesToday: agrega buckets por tienda y calcula delta %', async () => {
    const fake = withFakeRows([
      // 1ª query: filas por tienda+bucket.
      [
        { storeId: 's1', storeName: 'Centro', bucket: 'today', total: '300', count: 3n },
        { storeId: 's1', storeName: 'Centro', bucket: 'yesterday', total: '200', count: 2n },
      ],
      // 2ª query: counts org por bucket.
      [
        { bucket: 'today', count: 3n },
        { bucket: 'yesterday', count: 2n },
      ],
    ]);
    try {
      const res = await run(() => makeService().salesToday());
      expect(res.today.total).toBe(300);
      expect(res.yesterday.total).toBe(200);
      expect(res.today.count).toBe(3);
      expect(res.deltaPct).toBeCloseTo(50, 4); // (300-200)/200
      expect(res.byStore[0]).toMatchObject({ storeName: 'Centro', today: 300, yesterday: 200 });
      expect(res.byStore[0]!.deltaPct).toBeCloseTo(50, 4);
    } finally {
      fake.restore();
    }
  });

  // ─── salesByHour ────────────────────────────────────────────────────────────

  it('salesByHour: mapea hora, count (bigint→number) y revenue (string→number)', async () => {
    const fake = withFakeRows([
      [
        { hour: 9, count: 5n, revenue: '250.50' },
        { hour: 14, count: 3n, revenue: '120' },
      ],
    ]);
    try {
      const rows = await run(() => makeService().salesByHour({}));
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ hour: 9, count: 5, revenue: 250.5 });
      expect(rows[1]).toMatchObject({ hour: 14, count: 3, revenue: 120 });
    } finally {
      fake.restore();
    }
  });

  it('salesByHour: lista vacía cuando no hay ventas en el periodo', async () => {
    const fake = withFakeRows([[]]);
    try {
      const rows = await run(() => makeService().salesByHour({}));
      expect(rows).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── discountByEmployee ──────────────────────────────────────────────────────

  it('discountByEmployee: calcula descuento voluntario y ordena de mayor a menor', async () => {
    // Vendedor A: discount=30, promo=10 → voluntario=20; tarifa=subtotal+discount=200+30=230
    // Vendedor B: discount=50, promo=0  → voluntario=50; tarifa=100+50=150
    // B tiene mayor avgDiscountPct → debe aparecer primero
    const fake = withFakeRows([
      [
        {
          userId: 'u1',
          userName: 'Ana',
          count: 4n,
          discount: '30',
          promo: '10',
          subtotal: '200',
        },
        {
          userId: 'u2',
          userName: 'Bruno',
          count: 2n,
          discount: '50',
          promo: '0',
          subtotal: '100',
        },
      ],
    ]);
    try {
      const rows = await run(() => makeService().discountByEmployee({}));
      expect(rows).toHaveLength(2);
      // Bruno primero (mayor descuento voluntario)
      expect(rows[0]!.userName).toBe('Bruno');
      expect(rows[0]!.salesCount).toBe(2);
      expect(rows[0]!.avgDiscountPct).toBeCloseTo(50 / 150, 6); // 50/150
      // Ana segunda
      expect(rows[1]!.userName).toBe('Ana');
      expect(rows[1]!.avgDiscountPct).toBeCloseTo(20 / 230, 6); // (30-10)/(200+30)
    } finally {
      fake.restore();
    }
  });

  it('discountByEmployee: sin ventas devuelve avgDiscountPct=0 (evita /0)', async () => {
    const fake = withFakeRows([
      [
        {
          userId: 'u3',
          userName: 'Carlos',
          count: 0n,
          discount: '0',
          promo: '0',
          subtotal: '0',
        },
      ],
    ]);
    try {
      const rows = await run(() => makeService().discountByEmployee({}));
      expect(rows[0]!.avgDiscountPct).toBe(0);
    } finally {
      fake.restore();
    }
  });

  it('discountByEmployee: lista vacía cuando no hay vendedores', async () => {
    const fake = withFakeRows([[]]);
    try {
      const rows = await run(() => makeService().discountByEmployee({}));
      expect(rows).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── marginKpis: rama sin ventas ─────────────────────────────────────────────

  it('marginKpis: revenue cero → marginPct=0 (evita /0)', async () => {
    const fake = withFakeRows([[{ gross: '0', real: '0', revenue: '0' }]]);
    try {
      const m = await run(() => makeService().marginKpis({}));
      expect(m.marginPct).toBe(0);
    } finally {
      fake.restore();
    }
  });

  // ─── salesByFamily: lista vacía ──────────────────────────────────────────────

  it('salesByFamily: devuelve array vacío cuando no hay líneas de venta', async () => {
    const fake = withFakeRows([[]]);
    try {
      const rows = await run(() => makeService().salesByFamily({}));
      expect(rows).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── salesToday: cubre intraday y deltaPct null ──────────────────────────────

  it('salesToday: acumula intraday y devuelve deltaPct null cuando ayer=0', async () => {
    // 3 queries: filas por tienda+bucket, counts, hourly
    const fake = withFakeRows([
      // 1ª query: solo hoy (ayer=0 → deltaPct null)
      [{ storeId: 's1', storeName: 'Norte', bucket: 'today', total: '100', count: 2n }],
      // 2ª query: counts
      [{ bucket: 'today', count: 2n }],
      // 3ª query: hourly intradía (2 horas con ventas)
      [
        { hour: 10, total: '60' },
        { hour: 11, total: '40' },
      ],
    ]);
    try {
      const res = await run(() => makeService().salesToday());
      expect(res.today.total).toBe(100);
      expect(res.yesterday.total).toBe(0);
      expect(res.deltaPct).toBeNull(); // ayer=0 → null
      // intraday: acumulado → [60, 100]
      expect(res.intraday).toHaveLength(2);
      expect(res.intraday[0]).toBe(60);
      expect(res.intraday[1]).toBe(100);
    } finally {
      fake.restore();
    }
  });

  it('salesToday: sin ventas → totales cero e intraday vacío', async () => {
    const fake = withFakeRows([
      [], // sin filas por tienda
      [], // sin counts
      [], // sin hourly
    ]);
    try {
      const res = await run(() => makeService().salesToday());
      expect(res.today.total).toBe(0);
      expect(res.yesterday.total).toBe(0);
      expect(res.today.count).toBe(0);
      expect(res.yesterday.count).toBe(0);
      expect(res.deltaPct).toBeNull();
      expect(res.intraday).toHaveLength(0);
      expect(res.byStore).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── productRankings: lista vacía ────────────────────────────────────────────

  it('productRankings: listas vacías cuando no hay datos', async () => {
    const fake = withFakeRows([[], [], []]);
    try {
      const r = await run(() => makeService().productRankings({}));
      expect(r.topSales).toHaveLength(0);
      expect(r.topMargin).toHaveLength(0);
      expect(r.worstRotation).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── productRotation ─────────────────────────────────────────────────────────

  it('productRotation: mapea units, daysSinceLastSale, trend y archetypeAvgDaily', async () => {
    // 4 queries: summary, familyAgg, sessionDays, daily
    const now = new Date('2026-06-07T12:00:00Z');
    const createdAt = new Date('2026-05-01T00:00:00Z'); // 37 días → isNew=false
    const lastSale = new Date('2026-06-05T00:00:00Z'); // 2 días
    const fake = withFakeRows([
      // 1ª query: summary
      [
        {
          productId: 'p1',
          name: 'Producto A',
          familyId: 'f1',
          createdAt,
          units: '10',
          lastSale,
        },
      ],
      // 2ª query: familyAgg (familia f1: 30 unidades entre 3 productos)
      [{ familyId: 'f1', units: '30', productCount: 3n }],
      // 3ª query: sessionDays (5 días con caja abierta)
      [
        { day: new Date('2026-06-01') },
        { day: new Date('2026-06-02') },
        { day: new Date('2026-06-03') },
        { day: new Date('2026-06-04') },
        { day: new Date('2026-06-05') },
      ],
      // 4ª query: daily (tendencia por día)
      [
        { productId: 'p1', units: '4' },
        { productId: 'p1', units: '6' },
      ],
    ]);
    try {
      // Inyectamos `now` como parámetro opcional del método
      const svc = makeService();
      // Parcheamos `now()` para que el cálculo sea determinista
      // @ts-expect-error acceso a método privado en test
      vi.spyOn(svc, 'now').mockReturnValue(now);
      const rows = await run(() => svc.productRotation({}));
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.productId).toBe('p1');
      expect(row.name).toBe('Producto A');
      expect(row.units).toBe(10);
      // daysSinceLastSale: 2 días (2026-06-05 → 2026-06-07)
      expect(row.daysSinceLastSale).toBe(2);
      expect(row.isNew).toBe(false); // 37 días > 21
      // trend: [4, 6]
      expect(row.trend).toEqual([4, 6]);
      // archetypeAvgDaily: (30 / 5 días / 3 productos) = 2 → redondeado a 3 dec
      expect(row.archetypeAvgDaily).toBeCloseTo(2, 3);
    } finally {
      fake.restore();
    }
  });

  it('productRotation: producto sin lastSale → daysSinceLastSale=null', async () => {
    const now = new Date('2026-06-07T12:00:00Z');
    const createdAt = new Date('2026-05-25T00:00:00Z'); // 13 días → isNew=true
    const fake = withFakeRows([
      [{ productId: 'p2', name: 'Nuevo', familyId: null, createdAt, units: '0', lastSale: null }],
      [], // sin familyAgg
      [], // sin sessionDays → usa días naturales del periodo
      [], // sin daily
    ]);
    try {
      const svc = makeService();
      // @ts-expect-error acceso a método privado en test
      vi.spyOn(svc, 'now').mockReturnValue(now);
      const rows = await run(() => svc.productRotation({}));
      expect(rows[0]!.daysSinceLastSale).toBeNull();
      expect(rows[0]!.isNew).toBe(true);
      expect(rows[0]!.archetypeAvgDaily).toBeNull(); // sin familia
      expect(rows[0]!.trend).toEqual([]);
    } finally {
      fake.restore();
    }
  });

  it('productRotation: lista vacía cuando no hay productos activos', async () => {
    const fake = withFakeRows([[], [], [], []]);
    try {
      const rows = await run(() => makeService().productRotation({}));
      expect(rows).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  // ─── archetypeRotation ───────────────────────────────────────────────────────

  it('archetypeRotation: mapea familyName, ventaMediaDiaria, trend y daysSinceLastSale', async () => {
    // 3 queries: summary, daily, sessionDays
    const now = new Date('2026-06-07T12:00:00Z');
    const lastSale = new Date('2026-06-04T00:00:00Z'); // 3 días antes
    const fake = withFakeRows([
      // 1ª query: summary
      [
        {
          familyId: 'f1',
          familyName: 'Bebidas',
          productCount: 5n,
          units: '50',
          lastSale,
        },
      ],
      // 2ª query: daily (tendencia)
      [
        { familyId: 'f1', units: '10' },
        { familyId: 'f1', units: '15' },
        { familyId: 'f1', units: '25' },
      ],
      // 3ª query: sessionDays (10 días abiertos)
      Array.from({ length: 10 }, (_, i) => ({
        day: new Date(`2026-05-${String(i + 1).padStart(2, '0')}`),
      })),
    ]);
    try {
      const svc = makeService();
      // @ts-expect-error acceso a método privado en test
      vi.spyOn(svc, 'now').mockReturnValue(now);
      const rows = await run(() => svc.archetypeRotation({}));
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.familyId).toBe('f1');
      expect(row.familyName).toBe('Bebidas');
      expect(row.productCount).toBe(5);
      expect(row.units).toBe(50);
      // ventaMediaDiaria: round(50/10 * 1000)/1000 = 5
      expect(row.ventaMediaDiaria).toBeCloseTo(5, 3);
      // daysSinceLastSale: 3 días
      expect(row.daysSinceLastSale).toBe(3);
      // trend: [10, 15, 25]
      expect(row.trend).toEqual([10, 15, 25]);
    } finally {
      fake.restore();
    }
  });

  it('archetypeRotation: familia null → familyName="Sin arquetipo", daysSinceLastSale=null', async () => {
    const now = new Date('2026-06-07T12:00:00Z');
    const fake = withFakeRows([
      [
        {
          familyId: null,
          familyName: null,
          productCount: 2n,
          units: '8',
          lastSale: null,
        },
      ],
      // daily: sin familia → clave NONE='∅'
      [{ familyId: null, units: '8' }],
      // sessionDays vacío → usa días naturales del periodo (hoy → 1 día mín)
      [],
    ]);
    try {
      const svc = makeService();
      // @ts-expect-error acceso a método privado en test
      vi.spyOn(svc, 'now').mockReturnValue(now);
      const rows = await run(() => svc.archetypeRotation({}));
      expect(rows[0]!.familyId).toBeNull();
      expect(rows[0]!.familyName).toBe('Sin arquetipo');
      expect(rows[0]!.daysSinceLastSale).toBeNull();
      expect(rows[0]!.trend).toEqual([8]);
    } finally {
      fake.restore();
    }
  });

  it('archetypeRotation: lista vacía cuando no hay familias con productos activos', async () => {
    const fake = withFakeRows([[], [], []]);
    try {
      const rows = await run(() => makeService().archetypeRotation({}));
      expect(rows).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  it('archetypeRotation: sessionDays con datos → diasDisponibles usa sessionDays.length', async () => {
    const now = new Date('2026-06-07T12:00:00Z');
    const fake = withFakeRows([
      [{ familyId: 'f2', familyName: 'Vinos', productCount: 1n, units: '20', lastSale: null }],
      [], // sin daily → trend vacío
      // 4 días de caja abierta
      [
        { day: new Date('2026-06-01') },
        { day: new Date('2026-06-02') },
        { day: new Date('2026-06-03') },
        { day: new Date('2026-06-04') },
      ],
    ]);
    try {
      const svc = makeService();
      // @ts-expect-error acceso a método privado en test
      vi.spyOn(svc, 'now').mockReturnValue(now);
      const rows = await run(() => svc.archetypeRotation({}));
      // ventaMediaDiaria: 20/4 = 5
      expect(rows[0]!.ventaMediaDiaria).toBeCloseTo(5, 3);
      expect(rows[0]!.trend).toEqual([]);
    } finally {
      fake.restore();
    }
  });

  // ─── exige contexto de tenant ─────────────────────────────────────────────────

  it('exige contexto de tenant (requireTenant lanza sin él)', async () => {
    await expect(makeService().salesKpis({})).rejects.toThrow();
  });
});
