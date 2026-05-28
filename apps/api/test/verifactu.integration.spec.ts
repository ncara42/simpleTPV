// Test de integración de VeriFactu (#47) contra Postgres real (sin Redis → la
// cola degrada a envío síncrono con el proveedor sandbox). Valida el
// encadenamiento de huellas, el envío (SENT) y el aislamiento por tenant.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { SandboxVerifactuProvider } from '../src/verifactu/verifactu.provider.js';
import { VerifactuService } from '../src/verifactu/verifactu.service.js';

describe('VeriFactu — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let verifactu: VerifactuService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;

  function payload(invoiceNumber: string, total: number) {
    return {
      nif: 'B11111111',
      invoiceNumber,
      date: new Date().toISOString(),
      total,
      type: 'INVOICE' as const,
    };
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    verifactu = new VerifactuService(
      prisma as unknown as PrismaService,
      base,
      new SandboxVerifactuProvider(),
    );
    // Forzamos el modo SÍNCRONO (sin cola BullMQ) para que el test sea
    // determinista: con REDIS_URL el envío lo haría un worker async y el test
    // leería el estado antes de procesarse. El comportamiento con cola se cubre
    // en los unit tests.
    const savedRedis = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    verifactu.onModuleInit();
    if (savedRedis !== undefined) {
      process.env.REDIS_URL = savedRedis;
    }

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
  });

  beforeEach(async () => {
    await admin.$executeRaw`DELETE FROM "VerifactuRecord" WHERE "organizationId" IN (${org1Id}::uuid, ${org2Id}::uuid)`;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "VerifactuRecord" WHERE "organizationId" IN (${org1Id}::uuid, ${org2Id}::uuid)`;
    await verifactu.onModuleDestroy();
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('encadena las huellas: el 2º registro lleva previousHash = hash del 1º', async () => {
    const r1 = await tenantStorage.run({ organizationId: org1Id }, async () =>
      verifactu.recordFor({ type: 'INVOICE', payload: payload('T01-000001', 10) }),
    );
    const r2 = await tenantStorage.run({ organizationId: org1Id }, async () =>
      verifactu.recordFor({ type: 'INVOICE', payload: payload('T01-000002', 20) }),
    );
    expect(r1.hash).not.toBe(r2.hash);

    const rows = await admin.$queryRaw<
      Array<{ id: string; hash: string; previousHash: string | null; status: string }>
    >`
      SELECT id::text, hash, "previousHash", status::text FROM "VerifactuRecord"
      WHERE "organizationId" = ${org1Id}::uuid ORDER BY "createdAt" ASC
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.previousHash).toBeNull();
    expect(rows[1]!.previousHash).toBe(rows[0]!.hash);
    // Sandbox OK → ambos enviados (envío síncrono sin cola).
    expect(rows.every((r) => r.status === 'SENT')).toBe(true);
  });

  it('aislamiento por tenant: la cadena de org2 es independiente de org1', async () => {
    await tenantStorage.run({ organizationId: org1Id }, async () =>
      verifactu.recordFor({ type: 'INVOICE', payload: payload('T01-000001', 10) }),
    );
    const r2 = await tenantStorage.run({ organizationId: org2Id }, async () =>
      verifactu.recordFor({ type: 'INVOICE', payload: payload('T02-000001', 5) }),
    );
    // El primer registro de org2 no encadena con el de org1.
    const rows = await admin.$queryRaw<Array<{ previousHash: string | null }>>`
      SELECT "previousHash" FROM "VerifactuRecord" WHERE "organizationId" = ${org2Id}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.previousHash).toBeNull();
    expect(r2.hash).toMatch(/^[0-9a-f]{64}$/);

    // org2 solo ve su registro vía list (RLS).
    const list = await tenantStorage.run({ organizationId: org2Id }, async () => verifactu.list());
    expect(list).toHaveLength(1);
  });
});
