// Integración del módulo products contra Postgres con RLS.
// Verifica el criterio clave de la issue #3: aislamiento por tenant
// (org A no ve ni toca productos de org B) y la búsqueda ILIKE.
//
// Requisitos: DATABASE_URL (superuser), DATABASE_URL_APP (rol app).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { ProductsService } from '../src/products/products.service.js';

describe('Products integración (RLS por tenant + búsqueda)', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: ProductsService;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new ProductsService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL (superuser) requerido.');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
    try {
      const o1 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
      const o2 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
      if (!o1.length || !o2.length) throw new Error('Seed no ejecutado.');
      org1Id = o1[0]!.id;
      org2Id = o2[0]!.id;
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    await base.onModuleDestroy();
  });

  it('un producto creado en org1 no es visible para org2', async () => {
    const unique = `ITEST-${Date.now()}`;
    const created = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ name: unique, salePrice: 9.99, sku: unique }),
    )) as { id: string };
    expect(created.id).toBeTruthy();

    // org1 lo ve por búsqueda
    const seenByOrg1 = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.findAll(unique),
    )) as Array<{ id: string }>;
    expect(seenByOrg1.some((p) => p.id === created.id)).toBe(true);

    // org2 NO lo ve
    const seenByOrg2 = (await tenantStorage.run({ organizationId: org2Id }, () =>
      service.findAll(unique),
    )) as Array<{ id: string }>;
    expect(seenByOrg2.length).toBe(0);

    // org2 no puede leerlo por id (404 por RLS)
    await expect(
      tenantStorage.run({ organizationId: org2Id }, () => service.findOne(created.id)),
    ).rejects.toThrow();

    // limpieza
    await tenantStorage.run({ organizationId: org1Id }, () => service.remove(created.id));
  });
});
