import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { StoresService } from './stores.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

function makePrisma() {
  return {
    store: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      findMany: vi.fn(async (): Promise<unknown[]> => [{ id: 's1' }]),
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 's1', name: 'Tienda' })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      delete: vi.fn(async () => ({ id: 's1' })),
    },
  };
}

describe('StoresService', () => {
  it('create añade el organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new StoresService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Tienda Centro' }),
    );
    const arg = prisma.store.create.mock.calls[0]![0] as { data: { organizationId: string } };
    expect(arg.data.organizationId).toBe(ORG);
  });

  it('findAll lista las tiendas del tenant', async () => {
    const prisma = makePrisma();
    const service = new StoresService(prisma as never);
    const res = await service.findAll();
    expect(Array.isArray(res)).toBe(true);
  });

  it('update modifica una tienda existente', async () => {
    const prisma = makePrisma();
    const service = new StoresService(prisma as never);
    await service.update('s1', { name: 'Nueva' });
    expect(prisma.store.update).toHaveBeenCalledOnce();
  });

  it('update lanza 404 si no existe', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => null);
    const service = new StoresService(prisma as never);
    await expect(service.update('nope', { name: 'x' })).rejects.toThrow();
  });

  it('remove borra una tienda existente', async () => {
    const prisma = makePrisma();
    const service = new StoresService(prisma as never);
    await service.remove('s1');
    expect(prisma.store.delete).toHaveBeenCalledOnce();
  });
});
