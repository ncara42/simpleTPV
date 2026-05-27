// Test de integración: verifica que RLS aísla orgs DE VERDAD contra una
// instancia real de Postgres. Si esto falla, la seguridad multi-tenant
// está rota — todo el resto sobra.
//
// Requisitos previos:
//   - Postgres corriendo (docker compose up -d postgres).
//   - Migraciones aplicadas (initial + add_rls + app_login).
//   - Seed ejecutado (2 organizaciones: B11111111 y B22222222).
//   - DATABASE_URL_APP apunta al rol `app` (no superuser).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('RLS aislamiento multi-tenant', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const admin = new AdminClient({ datasources: { db: { url: adminUrl } } });
    try {
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
    } finally {
      await admin.$disconnect();
    }
  });

  afterAll(async () => {
    await base.onModuleDestroy();
  });

  it('org1 solo ve sus propios productos', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      const products = await prisma.product.findMany();
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.organizationId).toBe(org1Id);
      }
    });
  });

  it('org2 solo ve sus propios productos', async () => {
    await tenantStorage.run({ organizationId: org2Id }, async () => {
      const products = await prisma.product.findMany();
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.organizationId).toBe(org2Id);
      }
    });
  });

  it('sin contexto, devuelve 0 filas (fail-safe)', async () => {
    const products = await prisma.product.findMany();
    expect(products).toEqual([]);
  });

  it('contexto de org1 no permite leer datos de org2', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () => {
      const allUsers = await prisma.user.findMany();
      const org2Users = allUsers.filter((u) => u.organizationId === org2Id);
      expect(org2Users).toEqual([]);
    });
  });
});
