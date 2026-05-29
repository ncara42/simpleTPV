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

  it('exige contexto de tenant (requireTenant lanza sin él)', async () => {
    await expect(makeService().salesKpis({})).rejects.toThrow();
  });
});
