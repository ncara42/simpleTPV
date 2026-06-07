import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { ApiKeyLookupService } from './api-key-lookup.service.js';
import { ApiKeysService } from './api-keys.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

/** Ejecuta fn dentro de un contexto de tenant. */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'key-id-1',
        name: data['name'],
        prefix: data['prefix'],
      })),
      findMany: vi.fn(async (..._a: unknown[]) => []),
      findFirst: vi.fn(async (..._a: unknown[]) => null),
      updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      ...overrides,
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ApiKeysService(prisma as never);
}

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe('ApiKeysService.generate', () => {
  it('devuelve una key con formato stpv_<prefix8>_<rand>', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await run(() => svc.generate({ name: 'test-key' }));

    expect(result.key).toMatch(/^stpv_[A-Za-z0-9_-]{8}_/);
  });

  it('la key cruda se devuelve pero NO se persiste en BD', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await run(() => svc.generate({ name: 'test-key' }));

    // El create recibe hashedKey (sha256), nunca la raw key directamente.
    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['hashedKey']).toBeDefined();
    expect(createCall.data['hashedKey']).not.toBe(result.key);
    // El hash es sha256 → 64 hex chars.
    expect(createCall.data['hashedKey']).toHaveLength(64);
  });

  it('el hashedKey que persiste es sha256 de la key cruda', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await run(() => svc.generate({ name: 'test-key' }));

    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    const expectedHash = ApiKeyLookupService.hashKey(result.key);
    expect(createCall.data['hashedKey']).toBe(expectedHash);
  });

  it('el prefix guardado en BD coincide con los primeros 8 chars del segmento aleatorio', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await run(() => svc.generate({ name: 'test-key' }));

    // key: stpv_<prefix8>_<rand> → split por _ → ['stpv', prefix, rand]
    const parts = result.key.split('_');
    const prefixFromKey = parts[1];
    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['prefix']).toBe(prefixFromKey);
    expect(result.prefix).toBe(prefixFromKey);
  });

  it('incluye priceListId si se proporciona en el DTO', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const priceListId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await run(() => svc.generate({ name: 'con-lista', priceListId }));

    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['priceListId']).toBe(priceListId);
  });

  it('guarda null como priceListId cuando no se pasa en el DTO', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await run(() => svc.generate({ name: 'sin-lista' }));

    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['priceListId']).toBeNull();
  });

  it('guarda el organizationId del tenant activo', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await run(() => svc.generate({ name: 'org-check' }));

    const createCall = prisma.apiKey.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['organizationId']).toBe(ORG);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const svc = makeService(makePrisma());
    await expect(svc.generate({ name: 'sin-tenant' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('ApiKeysService.list', () => {
  it('filtra por organizationId del tenant', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await run(() => svc.list());

    const findCall = prisma.apiKey.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(findCall.where['organizationId']).toBe(ORG);
  });

  it('ordena por createdAt descendente', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await run(() => svc.list());

    const findCall = prisma.apiKey.findMany.mock.calls[0]![0] as {
      orderBy: Record<string, unknown>;
    };
    expect(findCall.orderBy).toMatchObject({ createdAt: 'desc' });
  });

  it('devuelve los registros que retorna Prisma', async () => {
    const mockRecords = [
      {
        id: 'k1',
        name: 'Key 1',
        prefix: 'abc12345',
        priceListId: null,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      },
    ];
    const prisma = makePrisma({
      findMany: vi.fn(async (..._a: unknown[]) => mockRecords),
    });
    const svc = makeService(prisma);

    const result = await run(() => svc.list());

    expect(result).toEqual(mockRecords);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const svc = makeService(makePrisma());
    await expect(svc.list()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// revoke
// ---------------------------------------------------------------------------

describe('ApiKeysService.revoke', () => {
  it('lanza NotFoundException (404) si la key no existe en el tenant', async () => {
    const prisma = makePrisma({
      findFirst: vi.fn(async (..._a: unknown[]) => null),
    });
    const svc = makeService(prisma);

    await expect(run(() => svc.revoke('no-existe'))).rejects.toThrow(NotFoundException);
  });

  it('llama updateMany con revokedAt si la key existe', async () => {
    const prisma = makePrisma({
      findFirst: vi.fn(async (..._a: unknown[]) => ({ id: 'k1' })),
    });
    const svc = makeService(prisma);

    await run(() => svc.revoke('k1'));

    const updateCall = prisma.apiKey.updateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateCall.where['id']).toBe('k1');
    expect(updateCall.where['organizationId']).toBe(ORG);
    expect(updateCall.data['revokedAt']).toBeInstanceOf(Date);
  });

  it('no llama updateMany cuando la key no se encuentra', async () => {
    const prisma = makePrisma({
      findFirst: vi.fn(async (..._a: unknown[]) => null),
    });
    const svc = makeService(prisma);

    await expect(run(() => svc.revoke('fantasma'))).rejects.toThrow(NotFoundException);
    expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const svc = makeService(makePrisma());
    await expect(svc.revoke('k1')).rejects.toThrow();
  });
});
