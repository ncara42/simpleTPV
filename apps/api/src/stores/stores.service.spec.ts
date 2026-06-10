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

describe('StoresService.updateOps', () => {
  it('persiste verificada/incidencia con marca de tiempo y 404 fuera del tenant', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' })) as never;
    prisma.store.update = vi.fn(async (a: unknown) => a) as never;
    const service = new StoresService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.updateOps('s1', { verified: true, incident: 'Persiana rota' }),
    );
    const arg = prisma.store.update.mock.calls[0]![0] as {
      data: { opsVerified: boolean; opsIncident: string; opsUpdatedAt: Date };
    };
    expect(arg.data.opsVerified).toBe(true);
    expect(arg.data.opsIncident).toBe('Persiana rota');
    expect(arg.data.opsUpdatedAt).toBeInstanceOf(Date);

    prisma.store.findFirst = vi.fn(async () => null) as never;
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.updateOps('nope', {})),
    ).rejects.toThrow();
  });

  it('incidencia vacía se normaliza a null', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' })) as never;
    prisma.store.update = vi.fn(async (a: unknown) => a) as never;
    const service = new StoresService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.updateOps('s1', { incident: '' }),
    );
    const arg = prisma.store.update.mock.calls[0]![0] as { data: { opsIncident: null } };
    expect(arg.data.opsIncident).toBeNull();
  });
});

describe('StoresService', () => {
  it('create añade el organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new StoresService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Tienda Centro', code: '01' }),
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
