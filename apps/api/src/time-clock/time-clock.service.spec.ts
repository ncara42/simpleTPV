import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      findMany: vi.fn(async (_a?: unknown) => [] as unknown),
      create: vi.fn(async (_a?: unknown) => ({ id: 'tc-1' }) as unknown),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TimeClockService(prisma as never);
}

// Hace que el "último fichaje" (que determina el estado actual) sea de un tipo dado.
function lastIs(prisma: ReturnType<typeof makePrisma>, type: string | null) {
  prisma.timeClockEntry.findFirst = vi.fn(async () => (type ? { id: 'last', type } : null));
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
    lastIs(prisma, null); // OUT → CLOCK_IN es válido, llega a la comprobación de dispositivo
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, type: 'CLOCK_IN' }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create lanza 404 si el dispositivo no está autorizado para la tienda', async () => {
    const prisma = makePrisma();
    lastIs(prisma, null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_IN' }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('create persiste el fichaje con tenant, tienda, user y deviceId', async () => {
    const prisma = makePrisma();
    lastIs(prisma, 'CLOCK_IN'); // estado IN → CLOCK_OUT es válido
    prisma.officialDevice.findFirst = vi.fn(async () => ({ id: 'dev-1', authorized: true }));
    prisma.timeClockEntry.create = vi.fn(async (a?: unknown) => ({
      id: 'tc-1',
      ...(a as { data: Record<string, unknown> }).data,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_OUT' }, 'user-1', 'ADMIN'),
    )) as Record<string, unknown>;

    const arg = prisma.timeClockEntry.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.storeId).toBe(STORE);
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.deviceId).toBe('dev-1');
    expect(arg.data.type).toBe('CLOCK_OUT');
    expect(result.deviceId).toBe('dev-1');
  });

  // --- Máquina de estados: transiciones inválidas → 409 ---

  it('rechaza una doble entrada (CLOCK_IN estando ya fichado)', async () => {
    const prisma = makePrisma();
    lastIs(prisma, 'CLOCK_IN'); // estado IN
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_IN' }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza salir sin estar fichado (CLOCK_OUT desde OUT)', async () => {
    const prisma = makePrisma();
    lastIs(prisma, null); // estado OUT
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, deviceId: 'dev-1', type: 'CLOCK_OUT' }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(/No tienes ningún fichaje activo/);
  });

  it('rechaza iniciar pausa sin estar fichado', async () => {
    const prisma = makePrisma();
    lastIs(prisma, null); // estado OUT
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { storeId: STORE, deviceId: 'dev-1', type: 'BREAK_START' },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(/Debes fichar entrada/);
  });

  it('rechaza terminar una pausa que no existe', async () => {
    const prisma = makePrisma();
    lastIs(prisma, 'CLOCK_IN'); // estado IN, no en pausa
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, deviceId: 'dev-1', type: 'BREAK_END' }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(/No tienes ninguna pausa activa/);
  });

  it('permite iniciar pausa estando fichado', async () => {
    const prisma = makePrisma();
    lastIs(prisma, 'CLOCK_IN'); // estado IN → BREAK_START válido
    prisma.officialDevice.findFirst = vi.fn(async () => ({ id: 'dev-1', authorized: true }));
    prisma.timeClockEntry.create = vi.fn(async (a?: unknown) => ({
      id: 'tc-2',
      ...(a as { data: Record<string, unknown> }).data,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ storeId: STORE, deviceId: 'dev-1', type: 'BREAK_START' }, 'user-1', 'ADMIN'),
    )) as Record<string, unknown>;

    expect(result.type).toBe('BREAK_START');
  });

  it('today resume estado, horas y fichajes del día', async () => {
    const prisma = makePrisma();
    const t0 = '2026-06-05T08:00:00.000Z';
    const t1 = '2026-06-05T08:30:00.000Z';
    prisma.timeClockEntry.findMany = vi.fn(async () => [
      { id: 'a', type: 'CLOCK_IN', createdAt: new Date(t0) },
      { id: 'b', type: 'BREAK_START', createdAt: new Date(t1) },
    ]);
    const service = makeService(prisma);

    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.today(STORE, 'user-1'),
    )) as { status: string; workedMs: number; entries: unknown[]; runningSince: string | null };

    expect(res.status).toBe('BREAK');
    expect(res.workedMs).toBe(30 * 60 * 1000); // 30 min trabajados antes de la pausa
    expect(res.runningSince).toBeNull(); // en pausa: no cuenta en vivo
    expect(res.entries).toHaveLength(2);
  });
});
