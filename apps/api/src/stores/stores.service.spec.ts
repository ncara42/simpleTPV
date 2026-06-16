import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { StoresService } from './stores.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

const ADMIN_ACTOR = { userId: 'u1', role: 'ADMIN' };

function makePrisma() {
  return {
    store: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      findMany: vi.fn(async (): Promise<unknown[]> => [{ id: 's1' }]),
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 's1', name: 'Tienda' })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
      findFirstOrThrow: vi.fn(
        async (_a?: unknown): Promise<unknown> => ({ id: 's1', isCentral: true }),
      ),
      delete: vi.fn(async () => ({ id: 's1' })),
    },
    userStore: {
      findFirst: vi.fn(async () => null),
    },
    $executeRaw: vi.fn(
      async (_strings?: TemplateStringsArray, ..._values: unknown[]): Promise<number> => 1,
    ),
  };
}

// Cliente BASE para withTenantTx (setCentral): $transaction ejecuta el callback con
// el MISMO mock como tx (así update/updateMany quedan observables en el test).
function makeBase(prisma: ReturnType<typeof makePrisma>) {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new StoresService(prisma as never, makeBase(prisma) as never);
}

describe('StoresService.updateOps', () => {
  it('persiste verificada/incidencia con marca de tiempo y 404 fuera del tenant', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' })) as never;
    prisma.store.update = vi.fn(async (a: unknown) => a) as never;
    const service = makeService(prisma);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.updateOps('s1', { verified: true, incident: 'Persiana rota' }, ADMIN_ACTOR),
    );
    const arg = prisma.store.update.mock.calls[0]![0] as {
      data: { opsVerified: boolean; opsIncident: string; opsUpdatedAt: Date };
    };
    expect(arg.data.opsVerified).toBe(true);
    expect(arg.data.opsIncident).toBe('Persiana rota');
    expect(arg.data.opsUpdatedAt).toBeInstanceOf(Date);

    prisma.store.findFirst = vi.fn(async () => null) as never;
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.updateOps('nope', {}, ADMIN_ACTOR)),
    ).rejects.toThrow();
  });

  it('incidencia vacía se normaliza a null', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' })) as never;
    prisma.store.update = vi.fn(async (a: unknown) => a) as never;
    const service = makeService(prisma);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.updateOps('s1', { incident: '' }, ADMIN_ACTOR),
    );
    const arg = prisma.store.update.mock.calls[0]![0] as { data: { opsIncident: null } };
    expect(arg.data.opsIncident).toBeNull();
  });
});

describe('StoresService', () => {
  it('create añade el organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Tienda Centro', code: '01' }),
    );
    const arg = prisma.store.create.mock.calls[0]![0] as { data: { organizationId: string } };
    expect(arg.data.organizationId).toBe(ORG);
  });

  it('findAll lista las tiendas del tenant', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const res = await service.findAll();
    expect(Array.isArray(res)).toBe(true);
  });

  it('update modifica una tienda existente', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await service.update('s1', { name: 'Nueva' });
    expect(prisma.store.update).toHaveBeenCalledOnce();
  });

  it('update lanza 404 si no existe', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);
    await expect(service.update('nope', { name: 'x' })).rejects.toThrow();
  });

  it('remove borra una tienda existente', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await service.remove('s1');
    expect(prisma.store.delete).toHaveBeenCalledOnce();
  });
});

describe('StoresService.setCentral (#146)', () => {
  it('marca la tienda como central tras desmarcar la anterior, en una transacción', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () => service.setCentral('s1', true));

    // Desmarca cualquier OTRA central de la org (id != s1) antes de marcar esta.
    const unmarkArg = prisma.store.updateMany.mock.calls[0]![0] as {
      where: { organizationId: string; isCentral: boolean; id: { not: string } };
      data: { isCentral: boolean };
    };
    expect(unmarkArg.where.organizationId).toBe(ORG);
    expect(unmarkArg.where.isCentral).toBe(true);
    expect(unmarkArg.where.id.not).toBe('s1');
    expect(unmarkArg.data.isCentral).toBe(false);

    // Marca la tienda objetivo como central.
    const markArg = prisma.store.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { isCentral: boolean };
    };
    expect(markArg.where.id).toBe('s1');
    expect(markArg.data.isCentral).toBe(true);
  });

  it('isCentral=false desmarca la tienda sin tocar a las demás', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: 's1' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () => service.setCentral('s1', false));

    // No se desmarca a nadie más (no se busca la central anterior).
    expect(prisma.store.updateMany).not.toHaveBeenCalled();
    const markArg = prisma.store.update.mock.calls[0]![0] as { data: { isCentral: boolean } };
    expect(markArg.data.isCentral).toBe(false);
  });

  it('lanza 404 si la tienda no existe en el tenant', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.setCentral('nope', true)),
    ).rejects.toThrow();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });
});
