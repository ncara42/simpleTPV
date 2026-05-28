// Test de integración de compras (#44) contra Postgres real. Valida el CRUD de
// proveedores, crear+confirmar un pedido y el aislamiento por tenant.
//
// Requisitos: Postgres + migraciones + seed + DATABASE_URL/DATABASE_URL_APP.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';

describe('Compras — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let suppliers: SuppliersService;
  let purchases: PurchasesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let storeId: string;
  let user1Id: string;
  let productId: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    suppliers = new SuppliersService(prisma as unknown as PrismaService);
    purchases = new PurchasesService(prisma as unknown as PrismaService, base);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const f1 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
    const f2 = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
    org1Id = f1[0]!.id;
    org2Id = f2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code LIMIT 1
    `;
    storeId = stores[0]!.id;
    const users = await admin.$queryRaw<
      Array<{ id: string }>
    >`SELECT id::text FROM "User" WHERE email = 'admin@org1.test'`;
    user1Id = users[0]!.id;
    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    productId = products[0]!.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "PurchaseOrder" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "Supplier" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('CRUD de proveedor aislado por tenant', async () => {
    const created = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.create({ name: 'Distribuidora X', leadTimeDays: 5 }),
    );
    expect(created.name).toBe('Distribuidora X');

    const list = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.findAll(),
    );
    expect(list.some((s) => s.id === created.id)).toBe(true);

    // org2 no ve el proveedor de org1.
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      suppliers.findAll(),
    );
    expect(fromOrg2.some((s) => s.id === created.id)).toBe(false);
  });

  it('crear pedido (DRAFT) y confirmarlo (CONFIRMED)', async () => {
    const supplier = await tenantStorage.run({ organizationId: org1Id }, async () =>
      suppliers.create({ name: 'Prov Pedido' }),
    );

    const order = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.create(
        {
          supplierId: supplier.id,
          storeId,
          lines: [{ productId, quantityOrdered: 20, unitCost: 3.5 }],
        },
        user1Id,
      ),
    );
    expect(order.status).toBe('DRAFT');
    expect(order.lines).toHaveLength(1);

    const confirmed = await tenantStorage.run({ organizationId: org1Id }, async () =>
      purchases.confirm(order.id),
    );
    expect(confirmed.status).toBe('CONFIRMED');

    // No se puede confirmar dos veces.
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => purchases.confirm(order.id)),
    ).rejects.toThrow(/no está en DRAFT/);
  });

  it('crear pedido rechaza proveedor de otra org', async () => {
    const supplierOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      suppliers.create({ name: 'Prov Org2' }),
    );
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () =>
        purchases.create(
          { supplierId: supplierOrg2.id, storeId, lines: [{ productId, quantityOrdered: 1 }] },
          user1Id,
        ),
      ),
    ).rejects.toThrow(/Proveedor no encontrado/);
    await admin.$executeRaw`DELETE FROM "Supplier" WHERE "organizationId" = ${org2Id}::uuid`;
  });
});
