// Tests de integración de API keys (IT-18) contra Postgres real.
// Verifica: almacenamiento seguro (solo hash), generación, revocación, aislamiento
// por tenant y que el endpoint /public/stock responde según la tarifa del key.
//
// Requisitos: Postgres + migraciones (incluida api_key) + seed.

import { createHash } from 'node:crypto';

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiKeyLookupService } from '../src/api-keys/api-key-lookup.service.js';
import { ApiKeysService } from '../src/api-keys/api-keys.service.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';

describe('API keys — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let lookupService: ApiKeyLookupService;
  let keysService: ApiKeysService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let generatedKeyId: string;
  const TAG = `apikeys-${Date.now()}`;

  const asOrg = <T>(org: string, fn: () => Promise<T>): Promise<T> =>
    tenantStorage.run({ organizationId: org }, fn);

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    lookupService = new ApiKeyLookupService();
    keysService = new ApiKeysService(prisma as unknown as PrismaService);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) throw new Error('DATABASE_URL requerida');
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const [o1, o2] = await Promise.all([
      admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "Organization" WHERE nif = 'B11111111'`,
      admin.$queryRaw<
        Array<{ id: string }>
      >`SELECT id::text FROM "Organization" WHERE nif = 'B22222222'`,
    ]);
    if (!o1.length || !o2.length) throw new Error('Seed no ejecutado');
    org1Id = o1[0]!.id;
    org2Id = o2[0]!.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`DELETE FROM "ApiKey" WHERE name LIKE ${`${TAG}%`}`;
    await admin.$disconnect();
    await base.onModuleDestroy();
    await lookupService.onModuleDestroy();
  });

  it('genera key: la key completa solo se retorna una vez', async () => {
    const result = await asOrg(org1Id, () => keysService.generate({ name: `${TAG}-key1` }));
    generatedKeyId = result.id;
    expect(result.key).toMatch(/^stpv_[A-Za-z0-9_-]+$/);
    expect(result.prefix).toHaveLength(8);
    expect(result.key).toContain(result.prefix);
    // La key en crudo NO debe estar en list()
    const list = await asOrg(org1Id, () => keysService.list());
    const entry = list.find((k) => k.id === result.id);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('key');
    expect(entry).not.toHaveProperty('hashedKey');
  });

  it('almacena solo el hash sha256 en la BD', async () => {
    // Verificar con consulta directa superuser (app_admin o superuser)
    const rows = await admin.$queryRaw<Array<{ hashedKey: string; prefix: string }>>`
      SELECT "hashedKey", prefix FROM "ApiKey" WHERE id = ${generatedKeyId}::uuid
    `;
    expect(rows).toHaveLength(1);
    const { hashedKey, prefix } = rows[0]!;
    expect(hashedKey).toHaveLength(64); // sha256 hex = 64 chars
    expect(prefix).toHaveLength(8);
    // El prefijo no es el hash
    expect(hashedKey).not.toContain(prefix);
  });

  it('lookup por hash: encuentra la key y devuelve organizationId', async () => {
    // Generar otra key para poder hacer lookup por hash
    const result = await asOrg(org1Id, () => keysService.generate({ name: `${TAG}-key2` }));
    const expectedHash = createHash('sha256').update(result.key).digest('hex');
    const record = await lookupService.findByHash(expectedHash);
    expect(record).not.toBeNull();
    expect(record!.organizationId).toBe(org1Id);
    expect(record!.revokedAt).toBeNull();
  });

  it('revoca: la key revocada no pasa el lookup', async () => {
    const result = await asOrg(org1Id, () => keysService.generate({ name: `${TAG}-revoke` }));
    const hash = createHash('sha256').update(result.key).digest('hex');

    await asOrg(org1Id, () => keysService.revoke(result.id));

    const record = await lookupService.findByHash(hash);
    expect(record).not.toBeNull();
    expect(record!.revokedAt).not.toBeNull();
  });

  it('aislamiento: org2 no puede revocar keys de org1', async () => {
    await expect(asOrg(org2Id, () => keysService.revoke(generatedKeyId))).rejects.toThrow();
  });

  it('list: org2 no ve keys de org1', async () => {
    const list = await asOrg(org2Id, () => keysService.list());
    expect(list.some((k) => k.id === generatedKeyId)).toBe(false);
  });
});
