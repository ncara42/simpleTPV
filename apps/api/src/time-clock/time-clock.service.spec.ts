import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { TimeClockService } from './time-clock.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

function makePrisma() {
  return {
    officialDevice: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
    },
    timeClockEntry: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
      create: vi.fn(async (_a?: unknown) => ({ id: 'tc-1' }) as unknown),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TimeClockService(prisma as never);
}

describe('TimeClockService', () => {
  it('current delega la búsqueda por tenant, tienda y usuario', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findFirst = vi.fn(async () => ({ id: 'tc-1', type: 'CLOCK_IN' }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.current(STORE, 'user-1'),
    )) as { id: string };

    const arg = prisma.timeClockEntry.findFirst.mock.calls[0]![0] as {
      where: { organizationId: string; storeId: string; userId: string };
      orderBy: { createdAt: 'desc' };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.userId).toBe('user-1');
    expect(arg.orderBy.createdAt).toBe('desc');
    expect(result.id).toBe('tc-1');
  });

  it('create lanza 403 si no hay deviceId', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, type: 'CLOCK_IN' }, 'user-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create lanza 404 si el dispositivo no está autorizado para la tienda', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_IN' }, 'user-1'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('create persiste el fichaje con tenant, tienda, user y deviceId', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({ id: 'dev-1', authorized: true }));
    prisma.timeClockEntry.create = vi.fn(async (a?: unknown) => ({
      id: 'tc-1',
      ...(a as { data: Record<string, unknown> }).data,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_OUT' }, 'user-1'),
    )) as Record<string, unknown>;

    const arg = prisma.timeClockEntry.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.storeId).toBe(STORE);
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.deviceId).toBe('dev-1');
    expect(arg.data.type).toBe('CLOCK_OUT');
    expect(result.deviceId).toBe('dev-1');
  });
});
