import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { SuppliersService } from './suppliers.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

function makePrisma(found: unknown = null) {
  return {
    supplier: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      findMany: vi.fn(async (_a?: unknown) => [{ id: 's1', name: 'Prov A' }]),
      findFirst: vi.fn(async (_a?: unknown) => found),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data })),
      delete: vi.fn(async (_a?: unknown) => ({ id: 's1' })),
    },
  };
}

describe('SuppliersService', () => {
  it('create añade organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new SuppliersService(prisma as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Prov A', leadTimeDays: 5 }),
    )) as unknown as { organizationId: string; name: string };
    expect(res.organizationId).toBe(ORG);
    expect(res.name).toBe('Prov A');
  });

  it('findAll filtra por organizationId', async () => {
    const prisma = makePrisma();
    const service = new SuppliersService(prisma as never);
    await tenantStorage.run({ organizationId: ORG }, () => service.findAll());
    const arg = prisma.supplier.findMany.mock.calls[0]![0] as { where: { organizationId: string } };
    expect(arg.where.organizationId).toBe(ORG);
  });

  it('findOne lanza 404 si no existe en el tenant', async () => {
    const prisma = makePrisma(null);
    const service = new SuppliersService(prisma as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.findOne('nope')),
    ).rejects.toThrow(NotFoundException);
  });

  it('update exige que exista (findOne) antes de actualizar', async () => {
    const prisma = makePrisma({ id: 's1', name: 'Prov A' });
    const service = new SuppliersService(prisma as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.update('s1', { name: 'Prov B' }),
    )) as unknown as { name: string };
    expect(res.name).toBe('Prov B');
  });

  it('remove lanza 404 si no existe', async () => {
    const prisma = makePrisma(null);
    const service = new SuppliersService(prisma as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.remove('nope')),
    ).rejects.toThrow(NotFoundException);
  });
});
