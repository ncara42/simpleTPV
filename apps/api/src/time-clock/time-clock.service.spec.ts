import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { endOfLocalDay, startOfLocalDay } from './time-clock.compute.js';
import { TimeClockService } from './time-clock.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';
const STORE2 = '33333333-3333-3333-3333-333333333333';

function makePrisma() {
  return {
    officialDevice: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
    },
    userStore: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
    },
    timeClockEntry: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
      findMany: vi.fn(async (_a?: unknown) => [] as unknown),
      create: vi.fn(async (_a?: unknown) => ({ id: 'tc-1' }) as unknown),
    },
  };
}

// Fichaje tal como lo devuelve history (con user/store incluidos), a una hora del
// 2026-06-05 en hora local para que localDayKey agrupe igual en cualquier zona.
function histEntry(
  type: string,
  hhmm: string,
  opts: { userId?: string; userName?: string; storeId?: string; storeName?: string } = {},
) {
  const userId = opts.userId ?? 'user-1';
  const storeId = opts.storeId ?? STORE;
  return {
    id: `${type}-${hhmm}-${userId}-${storeId}`,
    type,
    createdAt: new Date(`2026-06-05T${hhmm}:00`),
    userId,
    storeId,
    user: { name: opts.userName ?? 'Ana' },
    store: { name: opts.storeName ?? 'Centro' },
  };
}

// Cliente base mock para withTenantTx: su $transaction ejecuta el callback con un
// `tx` que reutiliza los mismos mocks que `prisma` (timeClockEntry/officialDevice),
// de modo que las aserciones sobre prisma.timeClockEntry.create siguen valiendo.
// $executeRaw cubre el set_config de withTenantTx y el advisory lock (S-12).
function makeBase(prisma: ReturnType<typeof makePrisma>) {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    timeClockEntry: prisma.timeClockEntry,
    officialDevice: prisma.officialDevice,
  };
  return { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TimeClockService(prisma as never, makeBase(prisma) as never);
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

  // --- Historial para backoffice: agrupación por jornada y totales ---

  it('history agrupa por usuario+jornada y calcula horas trabajadas y de pausa', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => [
      histEntry('CLOCK_IN', '08:00'),
      histEntry('BREAK_START', '10:00'),
      histEntry('BREAK_END', '10:30'),
      histEntry('CLOCK_OUT', '14:00'),
      histEntry('CLOCK_IN', '09:00', { userId: 'user-2', userName: 'Beto' }),
      histEntry('CLOCK_OUT', '13:00', { userId: 'user-2', userName: 'Beto' }),
    ]);
    const service = makeService(prisma);

    const rows = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.history({ storeId: STORE }, 'ADMIN', 'admin-1'),
    )) as Array<{
      userId: string;
      userName: string;
      date: string;
      firstIn: string | null;
      lastOut: string | null;
      workedMs: number;
      breakMs: number;
    }>;

    expect(rows).toHaveLength(2);

    const ana = rows.find((r) => r.userId === 'user-1')!;
    expect(ana.userName).toBe('Ana');
    expect(ana.date).toBe('2026-06-05');
    expect(ana.workedMs).toBe(5.5 * 60 * 60 * 1000); // 2h antes de la pausa + 3.5h después
    expect(ana.breakMs).toBe(30 * 60 * 1000);
    expect(ana.firstIn).toBe(new Date('2026-06-05T08:00:00').toISOString());
    expect(ana.lastOut).toBe(new Date('2026-06-05T14:00:00').toISOString());

    const beto = rows.find((r) => r.userId === 'user-2')!;
    expect(beto.workedMs).toBe(4 * 60 * 60 * 1000);
    expect(beto.breakMs).toBe(0);
  });

  it('history filtra por userId y aplica el rango de fechas explícito', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.history(
        { storeId: STORE, userId: 'user-1', from: '2026-06-01', to: '2026-06-03' },
        'ADMIN',
        'admin-1',
      ),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { userId?: string; createdAt: { gte: Date; lte: Date } };
    };
    expect(arg.where.userId).toBe('user-1');
    expect(arg.where.createdAt.gte.getTime()).toBe(
      startOfLocalDay(new Date('2026-06-01')).getTime(),
    );
    expect(arg.where.createdAt.lte.getTime()).toBe(endOfLocalDay(new Date('2026-06-03')).getTime());
  });

  it('history recorta el rango pedido a la ventana máxima de 90 días (DOS-02)', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    // Rango abusivo de ~2 años: el service debe acotar `from` a 90 días antes de `to`.
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.history({ storeId: STORE, from: '2024-01-01', to: '2026-06-05' }, 'ADMIN', 'admin-1'),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    const to = endOfLocalDay(new Date('2026-06-05'));
    const minFrom = startOfLocalDay(new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000));
    expect(arg.where.createdAt.lte.getTime()).toBe(to.getTime());
    expect(arg.where.createdAt.gte.getTime()).toBe(minFrom.getTime());
  });

  it('history respeta un rango dentro de la cota sin recortarlo', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.history({ storeId: STORE, from: '2026-06-01', to: '2026-06-03' }, 'ADMIN', 'admin-1'),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    // 3 días < 90 → from se mantiene tal cual lo pidió el cliente.
    expect(arg.where.createdAt.gte.getTime()).toBe(
      startOfLocalDay(new Date('2026-06-01')).getTime(),
    );
    expect(arg.where.createdAt.lte.getTime()).toBe(endOfLocalDay(new Date('2026-06-03')).getTime());
  });

  it('historyAll recorta el rango pedido a la ventana máxima de 90 días (DOS-04)', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.historyAll({ from: '2020-01-01', to: '2026-06-05' }),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    const to = endOfLocalDay(new Date('2026-06-05'));
    const minFrom = startOfLocalDay(new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000));
    expect(arg.where.createdAt.gte.getTime()).toBe(minFrom.getTime());
  });

  it('entries recorta el rango pedido a la ventana máxima de 90 días (DOS-04)', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.entries({ storeId: STORE, from: '2020-01-01', to: '2026-06-05' }, 'ADMIN', 'admin-1'),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    const to = endOfLocalDay(new Date('2026-06-05'));
    const minFrom = startOfLocalDay(new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000));
    expect(arg.where.createdAt.gte.getTime()).toBe(minFrom.getTime());
  });

  it('history lanza 403 para un CLERK sin acceso a la tienda', async () => {
    const prisma = makePrisma();
    prisma.userStore.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.history({ storeId: STORE }, 'CLERK', 'clerk-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('historyAll agrega jornadas de TODAS las tiendas sin exigir storeId, agrupando por usuario+tienda+día', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => [
      histEntry('CLOCK_IN', '08:00'),
      histEntry('CLOCK_OUT', '12:00'),
      // Mismo empleado, mismo día, OTRA tienda → jornada distinta.
      histEntry('CLOCK_IN', '13:00', { storeId: STORE2, storeName: 'Norte' }),
      histEntry('CLOCK_OUT', '17:00', { storeId: STORE2, storeName: 'Norte' }),
    ]);
    const service = makeService(prisma);

    const rows = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.historyAll({}),
    )) as Array<{ storeId: string; storeName: string; workedMs: number }>;

    // No filtra por tienda: el where solo lleva tenant + rango (sin storeId/userId).
    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { storeId?: string; userId?: string; createdAt: { gte: Date; lte: Date } };
    };
    expect(arg.where.storeId).toBeUndefined();
    expect(arg.where.userId).toBeUndefined();

    expect(rows).toHaveLength(2);
    const centro = rows.find((r) => r.storeId === STORE)!;
    const norte = rows.find((r) => r.storeId === STORE2)!;
    expect(centro.storeName).toBe('Centro');
    expect(centro.workedMs).toBe(4 * 60 * 60 * 1000);
    expect(norte.storeName).toBe('Norte');
    expect(norte.workedMs).toBe(4 * 60 * 60 * 1000);
  });

  it('historyAll aplica filtros opcionales de tienda, empleado y rango', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => []);
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.historyAll({
        storeId: STORE,
        userId: 'user-1',
        from: '2026-06-01',
        to: '2026-06-03',
      }),
    );

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { storeId?: string; userId?: string; createdAt: { gte: Date; lte: Date } };
    };
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.userId).toBe('user-1');
    expect(arg.where.createdAt.gte.getTime()).toBe(
      startOfLocalDay(new Date('2026-06-01')).getTime(),
    );
    expect(arg.where.createdAt.lte.getTime()).toBe(endOfLocalDay(new Date('2026-06-03')).getTime());
  });

  // --- Log en bruto de fichajes (detalle de tienda del backoffice) ---

  it('entries devuelve el log en bruto mapeado, lo más reciente primero, acotado por tienda/tenant', async () => {
    const prisma = makePrisma();
    prisma.timeClockEntry.findMany = vi.fn(async () => [
      histEntry('CLOCK_IN', '09:00', { userName: 'Marta' }),
      histEntry('CLOCK_OUT', '14:00', { userName: 'Marta' }),
    ]);
    const service = makeService(prisma);

    const rows = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.entries({ storeId: STORE }, 'MANAGER', 'mgr-1'),
    )) as Array<{ userName: string; type: string; createdAt: string }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]!.userName).toBe('Marta');
    expect(rows[0]!.type).toBe('CLOCK_IN');
    expect(typeof rows[0]!.createdAt).toBe('string'); // ISO, no Date

    const arg = prisma.timeClockEntry.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; storeId: string };
      orderBy: { createdAt: string };
    };
    expect(arg.where).toMatchObject({ organizationId: ORG, storeId: STORE });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' }); // lo más reciente primero
  });

  it('entries lanza 403 para un CLERK sin acceso a la tienda', async () => {
    const prisma = makePrisma();
    prisma.userStore.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.entries({ storeId: STORE }, 'CLERK', 'clerk-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
