import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { UsersService } from './users.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

function makePrisma() {
  return {
    user: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', ...data })),
      findMany: vi.fn(async (): Promise<unknown[]> => [{ id: 'u1' }]),
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'u1', email: 'a@b.test' })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', ...data })),
      delete: vi.fn(async () => ({ id: 'u1' })),
    },
    userStore: {
      deleteMany: vi.fn(async (_a?: unknown): Promise<unknown> => ({ count: 0 })),
      createMany: vi.fn(async (_a?: unknown): Promise<unknown> => ({ count: 1 })),
    },
    store: {
      // Por defecto devuelve como propias todas las tiendas pedidas (RLS las
      // filtraría al tenant actual en la BD real).
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id })),
      ),
    },
  };
}

describe('UsersService', () => {
  it('create hashea la password y añade organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({
        email: 'nuevo@org.test',
        name: 'Nuevo',
        password: 'secreto',
        role: 'CLERK',
      }),
    );
    const arg = prisma.user.create.mock.calls[0]![0] as {
      data: { organizationId: string; passwordHash: string; password?: string };
    };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.passwordHash).toBeTruthy();
    expect(arg.data.password).toBeUndefined(); // no se guarda en claro
    expect(bcrypt.compareSync('secreto', arg.data.passwordHash)).toBe(true);
  });

  it('setPin hashea el PIN', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never);
    await service.setPin('u1', '1234');
    const arg = prisma.user.update.mock.calls[0]![0] as { data: { pinHash: string } };
    expect(arg.data.pinHash).toBeTruthy();
    expect(bcrypt.compareSync('1234', arg.data.pinHash)).toBe(true);
  });

  it('assignStores reemplaza las asignaciones del usuario', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never);
    await service.assignStores('u1', ['s1', 's2']);
    expect(prisma.userStore.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.userStore.createMany).toHaveBeenCalledOnce();
    const arg = prisma.userStore.createMany.mock.calls[0]![0] as {
      data: Array<{ userId: string; storeId: string }>;
    };
    expect(arg.data).toHaveLength(2);
  });

  it('assignStores rechaza tiendas que no pertenecen al tenant', async () => {
    const prisma = makePrisma();
    // RLS solo deja ver 's1'; 's2' es de otra organización.
    prisma.store.findMany = vi.fn(async () => [{ id: 's1' }]);
    const service = new UsersService(prisma as never);
    await expect(service.assignStores('u1', ['s1', 's2'])).rejects.toThrow();
    expect(prisma.userStore.createMany).not.toHaveBeenCalled();
  });

  it('update no expone passwordHash si no se cambia password', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never);
    await service.update('u1', { name: 'Renombrado' });
    const arg = prisma.user.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.name).toBe('Renombrado');
    expect(arg.data.passwordHash).toBeUndefined();
  });

  it('update lanza 404 si el usuario no existe', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = vi.fn(async () => null);
    const service = new UsersService(prisma as never);
    await expect(service.update('nope', { name: 'x' })).rejects.toThrow();
  });

  it('create devuelve solo campos públicos (sin passwordHash ni pinHash)', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ email: 'x@org.test', name: 'X', password: 'pw', role: 'CLERK' }),
    );
    const arg = prisma.user.create.mock.calls[0]![0] as unknown as {
      select: Record<string, boolean>;
    };
    expect(arg.select).toBeDefined();
    expect(arg.select.passwordHash).toBeUndefined();
    expect(arg.select.pinHash).toBeUndefined();
    expect(arg.select.email).toBe(true);
  });
});
