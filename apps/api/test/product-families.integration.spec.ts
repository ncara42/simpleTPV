// Integración de product-families contra Postgres con RLS.
// Verifica aislamiento por tenant y la construcción del árbol.
// Requisitos: DATABASE_URL (superuser), DATABASE_URL_APP (rol app).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { ProductFamiliesService } from '../src/product-families/product-families.service.js';

describe('ProductFamilies integración (RLS + árbol)', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: ProductFamiliesService;
  let org1Id: string;
  let org2Id: string;
  const created: string[] = [];

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new ProductFamiliesService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL requerido.');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
    try {
      const o1 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`;
      const o2 = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`;
      org1Id = o1[0]!.id;
      org2Id = o2[0]!.id;
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    // limpieza
    for (const id of created) {
      await tenantStorage
        .run({ organizationId: org1Id }, () => service.remove(id))
        .catch(() => undefined);
    }
    await base.onModuleDestroy();
  });

  it('una familia de org1 no es visible para org2; el árbol anida hijos', async () => {
    const root = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ name: `ITEST-root-${Date.now()}` }),
    )) as { id: string };
    created.push(root.id);

    const child = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ name: 'ITEST-child', parentId: root.id }),
    )) as { id: string };
    created.unshift(child.id); // borrar hijo antes que padre

    // org1 ve el árbol con el hijo anidado
    const tree1 = await tenantStorage.run({ organizationId: org1Id }, () => service.findTree());
    const rootNode = tree1.find((n) => n.id === root.id);
    expect(rootNode).toBeDefined();
    expect(rootNode!.children.some((c) => c.id === child.id)).toBe(true);

    // org2 NO ve esas familias
    const tree2 = await tenantStorage.run({ organizationId: org2Id }, () => service.findTree());
    expect(tree2.some((n) => n.id === root.id)).toBe(false);
  });

  it('rechaza crear ciclo: mover la raíz bajo su propio hijo', async () => {
    const root = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ name: `ITEST-cyc-${Date.now()}` }),
    )) as { id: string };
    created.push(root.id);
    const child = (await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ name: 'ITEST-cyc-child', parentId: root.id }),
    )) as { id: string };
    created.unshift(child.id);

    await expect(
      tenantStorage.run({ organizationId: org1Id }, () =>
        service.update(root.id, { parentId: child.id }),
      ),
    ).rejects.toThrow();
  });
});
