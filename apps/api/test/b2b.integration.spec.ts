// Test de integración de B2B (clientes + tarifas, IT-17) contra Postgres real.
// Verifica CRUD, aislamiento por tenant (RLS) y que no se puede asignar una tarifa de
// otra organización. Requisitos: Postgres + migraciones (incl. tablas B2B) + seed.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CustomersService } from '../src/b2b/customers.service.js';
import { PriceListsService } from '../src/b2b/price-lists.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('B2B clientes + tarifas — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let customers: CustomersService;
  let priceLists: PriceListsService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let productId: string;
  let priceListId: string;
  let customerId: string;
  const TAG = `b2b-${Date.now()}`;

  const asOrg = <T>(org: string, fn: () => Promise<T>): Promise<T> =>
    tenantStorage.run({ organizationId: org }, fn);

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    customers = new CustomersService(prisma as unknown as PrismaService);
    priceLists = new PriceListsService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL (superuser) requerido en setup.');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const o1 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
    const o2 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
    if (o1.length === 0 || o2.length === 0) throw new Error('Seed no ejecutado.');
    org1Id = o1[0]!.id;
    org2Id = o2[0]!.id;
    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid ORDER BY name LIMIT 1
    `;
    productId = products[0]!.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "Customer" WHERE name LIKE ${`${TAG}%`}`;
    await admin.$executeRaw`DELETE FROM "PriceList" WHERE name LIKE ${`${TAG}%`}`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('tarifa: crea, fija un precio y lo lista con su recuento', async () => {
    const pl = await asOrg(org1Id, () => priceLists.create({ name: `${TAG}-tarifa` }));
    priceListId = pl.id;
    await asOrg(org1Id, () => priceLists.setItem(pl.id, { productId, price: 9.5 }));
    const full = await asOrg(org1Id, () => priceLists.get(pl.id));
    expect(full?.items).toHaveLength(1);
    expect(Number(full!.items[0]!.price)).toBeCloseTo(9.5, 2);
    const list = await asOrg(org1Id, () => priceLists.list());
    expect(list.find((r) => r.id === pl.id)?.itemCount).toBe(1);
  });

  it('cliente: crea con la tarifa asignada', async () => {
    const c = await asOrg(org1Id, () =>
      customers.create({ name: `${TAG}-cliente`, nif: 'B99999999', priceListId }),
    );
    customerId = c.id;
    expect(c.priceListId).toBe(priceListId);
  });

  it('rechaza asignar una tarifa de OTRA organización (no solo RLS)', async () => {
    const pl2 = await asOrg(org2Id, () => priceLists.create({ name: `${TAG}-org2` }));
    await expect(
      asOrg(org1Id, () => customers.create({ name: `${TAG}-malo`, priceListId: pl2.id })),
    ).rejects.toThrow();
  });

  it('aislamiento por tenant: org2 no ve los clientes ni tarifas de org1', async () => {
    const cs = await asOrg(org2Id, () => customers.list());
    expect(cs.some((c) => c.id === customerId)).toBe(false);
    const pls = await asOrg(org2Id, () => priceLists.list());
    expect(pls.some((p) => p.id === priceListId)).toBe(false);
  });
});
