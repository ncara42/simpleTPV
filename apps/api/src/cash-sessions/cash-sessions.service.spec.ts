import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import {
  CashSessionsService,
  computeDifference,
  computeExpected,
} from './cash-sessions.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

describe('computeExpected', () => {
  it('suma inicial + ventas en efectivo del turno', () => {
    expect(computeExpected(100, 250)).toBeCloseTo(350, 2);
  });

  it('sin ventas en efectivo, esperado = inicial', () => {
    expect(computeExpected(50, 0)).toBeCloseTo(50, 2);
  });

  it('redondea a 2 decimales', () => {
    expect(computeExpected(10.1, 0.2)).toBeCloseTo(10.3, 2);
  });

  it('SEC-11: resta los reembolsos en efectivo del turno', () => {
    // inicial 100 + ventas 250 + neto movimientos 0 − reembolsos 50 = 300.
    expect(computeExpected(100, 250, 0, 50)).toBeCloseTo(300, 2);
  });
});

describe('computeDifference', () => {
  it('cuadre exacto: diferencia 0', () => {
    expect(computeDifference(350, 350)).toBeCloseTo(0, 2);
  });

  it('sobrante: contado > esperado → positivo', () => {
    expect(computeDifference(360, 350)).toBeCloseTo(10, 2);
  });

  it('faltante: contado < esperado → negativo', () => {
    expect(computeDifference(340, 350)).toBeCloseTo(-10, 2);
  });

  it('redondea a 2 decimales', () => {
    expect(computeDifference(10.05, 10)).toBeCloseTo(0.05, 2);
  });
});

// Mock mínimo del cliente Prisma extendido. Solo declaramos los modelos/
// operaciones que tocan los métodos bajo test.
function makePrisma() {
  return {
    cashSession: {
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => null),
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
      create: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'cs-1' })),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'cs-1' })),
    },
    // Acceso por tienda (assertStoreAccess): por defecto el usuario está asignado.
    // Los tests de roles org-wide (ADMIN/MANAGER) ni lo consultan.
    userStore: {
      findFirst: vi.fn(
        async (_a?: unknown): Promise<{ storeId: string } | null> => ({
          storeId: STORE,
        }),
      ),
    },
    sale: {
      aggregate: vi.fn(
        async (_a?: unknown): Promise<{ _sum: { total: number | null } }> => ({
          _sum: { total: 0 },
        }),
      ),
    },
    return: {
      aggregate: vi.fn(
        async (_a?: unknown): Promise<{ _sum: { total: number | null } }> => ({
          _sum: { total: 0 },
        }),
      ),
    },
    cashMovement: {
      groupBy: vi.fn(
        async (
          _a?: unknown,
        ): Promise<
          Array<{ type: 'IN' | 'OUT' | 'TRANSFER_OUT'; _sum: { amount: number | null } }>
        > => [],
      ),
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => null),
      create: vi.fn(
        async (a?: unknown): Promise<unknown> => ({
          id: 'cm-1',
          amount: 10,
          storeId: STORE,
          type: 'IN',
          ...(a as { data?: Record<string, unknown> } | undefined)?.data,
        }),
      ),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'cm-1' })),
    },
    // Tienda central para resolver el destino de los traspasos (#146). Por defecto
    // hay una central distinta del origen.
    store: {
      findFirst: vi.fn(
        async (_a?: unknown): Promise<{ id: string } | null> => ({ id: 'central-store' }),
      ),
    },
    // Lock pesimista del fix TOCTOU (RACE-02): withTenantTx fija el tenant con
    // set_config y createMovement ejecuta SELECT ... FOR UPDATE sobre la sesión.
    $executeRaw: vi.fn(
      async (_strings?: TemplateStringsArray, ..._values: unknown[]): Promise<number> => 1,
    ),
  };
}

// Cliente BASE para withTenantTx: $transaction ejecuta el callback con el MISMO
// mock como tx (así findFirst/create/$executeRaw quedan observables en el test).
function makeBase(prisma: ReturnType<typeof makePrisma>) {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
}

// Bus de eventos mock: solo observamos publish (cash.movement.requested, #146).
function makeEvents() {
  return { publish: vi.fn(async (): Promise<void> => undefined) };
}

function makeService(prisma: ReturnType<typeof makePrisma>, events = makeEvents()) {
  return new CashSessionsService(prisma as never, makeBase(prisma) as never, events as never);
}

describe('CashSessionsService.open', () => {
  it('lanza 400 si ya hay una caja abierta en la tienda', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-existing', status: 'OPEN' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.open({ storeId: STORE, openingAmount: 100 }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('abre la caja con el tenant, store, user y openingAmount correctos', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    prisma.cashSession.create = vi.fn(async (a?: unknown) => ({
      id: 'cs-1',
      ...(a as { data: Record<string, unknown> }).data,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.open({ storeId: STORE, openingAmount: 100 }, 'user-1', 'ADMIN'),
    )) as unknown as Record<string, unknown>;

    const arg = prisma.cashSession.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.storeId).toBe(STORE);
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.openingAmount).toBe(100);
    expect(arg.data.status).toBe('OPEN');
    expect(result.organizationId).toBe(ORG);
  });

  it('lanza 500 si no hay contexto de tenant', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await expect(
      service.open({ storeId: STORE, openingAmount: 0 }, 'user-1', 'ADMIN'),
    ).rejects.toThrow();
  });
});

describe('CashSessionsService.close', () => {
  it('lanza 404 si la sesión no existe', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.close('nope', { countedAmount: 100 }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la sesión ya está cerrada', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.close('cs-1', { countedAmount: 100 }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('cierra con cuadre: expected = inicial + ventas CASH; difference = contado − expected', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 100,
      openedAt: new Date('2026-05-28T08:00:00Z'),
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 250 } }));
    prisma.cashSession.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashSession.findFirstOrThrow = vi.fn(async () => ({
      id: 'cs-1',
      status: 'CLOSED',
      expectedAmount: 350,
      closingAmount: 360,
      difference: 10,
    }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.close('cs-1', { countedAmount: 360 }, 'user-1', 'ADMIN'),
    );

    // El cuadre viaja al WHERE/data del update con el tenant y status OPEN.
    const arg = prisma.cashSession.updateMany.mock.calls[0]![0] as {
      where: { status: string; organizationId: string };
      data: { status: string; expectedAmount: number; closingAmount: number; difference: number };
    };
    expect(arg.where.status).toBe('OPEN');
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.data.status).toBe('CLOSED');
    expect(arg.data.expectedAmount).toBeCloseTo(350, 2); // 100 + 250
    expect(arg.data.closingAmount).toBe(360);
    expect(arg.data.difference).toBeCloseTo(10, 2); // 360 − 350 (sobrante)
    expect(result).toMatchObject({ id: 'cs-1', status: 'CLOSED' });
  });

  it('solo suma ventas en efectivo: aggregate filtra COMPLETED + CASH desde la apertura', async () => {
    const prisma = makePrisma();
    const openedAt = new Date('2026-05-28T08:00:00Z');
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 0,
      openedAt,
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 0 } }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.close('cs-1', { countedAmount: 0 }, 'user-1', 'ADMIN'),
    );

    const arg = prisma.sale.aggregate.mock.calls[0]![0] as {
      where: {
        organizationId: string;
        storeId: string;
        status: string;
        paymentMethod: string;
        createdAt: { gte: Date };
      };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.status).toBe('COMPLETED');
    expect(arg.where.paymentMethod).toBe('CASH');
    expect(arg.where.createdAt.gte).toBe(openedAt);
  });

  it('incluye entradas y retiradas externas en el esperado de caja', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 100,
      openedAt: new Date('2026-05-28T08:00:00Z'),
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 50 } }));
    prisma.cashMovement.groupBy = vi.fn(async () => [
      { type: 'IN', _sum: { amount: 20 } },
      { type: 'OUT', _sum: { amount: 5 } },
    ]);
    prisma.cashSession.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashSession.findFirstOrThrow = vi.fn(async () => ({
      id: 'cs-1',
      status: 'CLOSED',
      expectedAmount: 165,
      closingAmount: 165,
      difference: 0,
    }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.close('cs-1', { countedAmount: 165 }, 'user-1', 'ADMIN'),
    );

    const arg = prisma.cashSession.updateMany.mock.calls[0]![0] as {
      data: { expectedAmount: number };
    };
    expect(arg.data.expectedAmount).toBeCloseTo(165, 2);
  });

  it('SEC-11: resta los reembolsos en efectivo del esperado', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 100,
      openedAt: new Date('2026-05-28T08:00:00Z'),
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 250 } }));
    // 30€ devueltos en efectivo en el turno → salen del cajón.
    prisma.return.aggregate = vi.fn(async () => ({ _sum: { total: 30 } }));
    prisma.cashSession.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashSession.findFirstOrThrow = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.close('cs-1', { countedAmount: 320 }, 'user-1', 'ADMIN'),
    );

    // El filtro de reembolsos acota a la tienda, ventana del turno y efectivo
    // (venta original CASH o devolución sin ticket).
    const refundArg = prisma.return.aggregate.mock.calls[0]![0] as {
      where: { storeId: string; createdAt: { gte: Date }; OR: unknown[] };
    };
    expect(refundArg.where.storeId).toBe(STORE);
    expect(refundArg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(Array.isArray(refundArg.where.OR)).toBe(true);

    const arg = prisma.cashSession.updateMany.mock.calls[0]![0] as {
      data: { expectedAmount: number; difference: number };
    };
    // 100 + 250 − 30 = 320 → cuadre exacto con 320 contados.
    expect(arg.data.expectedAmount).toBeCloseTo(320, 2);
    expect(arg.data.difference).toBeCloseTo(0, 2);
  });

  it('lanza 400 si updateMany afecta 0 filas (carrera concurrente)', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 100,
      openedAt: new Date(),
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 0 } }));
    prisma.cashSession.updateMany = vi.fn(async () => ({ count: 0 }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.close('cs-1', { countedAmount: 100 }, 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CashSessionsService.current', () => {
  it('devuelve la sesión OPEN de la tienda', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN' }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.current(STORE, 'user-1', 'ADMIN'),
    );

    const arg = prisma.cashSession.findFirst.mock.calls[0]![0] as {
      where: { storeId: string; organizationId: string; status: string };
    };
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.status).toBe('OPEN');
    expect(result).toMatchObject({ id: 'cs-1', status: 'OPEN' });
  });

  it('devuelve null si no hay caja abierta', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.current(STORE, 'user-1', 'ADMIN'),
    );
    expect(result).toBeNull();
  });
});

describe('CashSessionsService.movements', () => {
  it('lanza 404 si la sesión no existe', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.movements('cs-1', 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lista movimientos ordenados por fecha para la sesión del tenant', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1' }));
    prisma.cashMovement.findMany = vi.fn(async () => [{ id: 'cm-1', type: 'OUT' }]);
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.movements('cs-1', 'user-1', 'ADMIN'),
    )) as Array<{ id: string }>;

    const arg = prisma.cashMovement.findMany.mock.calls[0]![0] as {
      where: { cashSessionId: string; organizationId: string };
      orderBy: { createdAt: 'desc' };
    };
    expect(arg.where.cashSessionId).toBe('cs-1');
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.orderBy.createdAt).toBe('desc');
    expect(result[0]!.id).toBe('cm-1');
  });
});

describe('CashSessionsService.createMovement', () => {
  it('lanza 404 si la sesión no existe', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.createMovement(
          'cs-1',
          { type: 'OUT', amount: 10, reason: 'retirada' },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la sesión está cerrada', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.createMovement(
          'cs-1',
          { type: 'OUT', amount: 10, reason: 'retirada' },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea el movimiento con tenant, store y motivo saneado', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
    }));
    prisma.cashMovement.create = vi.fn(async (a?: unknown) => ({
      id: 'cm-1',
      ...(a as { data: Record<string, unknown> }).data,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.createMovement(
        'cs-1',
        { type: 'IN', amount: 30, reason: '  Fondo  ' },
        'user-1',
        'ADMIN',
      ),
    )) as Record<string, unknown>;

    const arg = prisma.cashMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.cashSessionId).toBe('cs-1');
    expect(arg.data.storeId).toBe(STORE);
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.type).toBe('IN');
    expect(arg.data.amount).toBe(30);
    expect(arg.data.reason).toBe('Fondo');
    expect(result.reason).toBe('Fondo');
  });

  it('RACE-02: bloquea la fila (FOR UPDATE) ANTES de leer el estado de la sesión', async () => {
    const prisma = makePrisma();
    const calls: string[] = [];
    // withTenantTx emite primero un set_config (fija el tenant) y luego
    // createMovement emite el SELECT ... FOR UPDATE. Distinguimos por contenido.
    prisma.$executeRaw = vi.fn(async (strings?: TemplateStringsArray) => {
      const sql = (strings ?? ([''] as unknown as TemplateStringsArray)).join('');
      calls.push(sql.includes('FOR UPDATE') ? 'lock' : 'set_config');
      return 1;
    });
    prisma.cashSession.findFirst = vi.fn(async () => {
      calls.push('read');
      return { id: 'cs-1', status: 'OPEN', storeId: STORE };
    });
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.createMovement('cs-1', { type: 'IN', amount: 10, reason: 'fondo' }, 'user-1', 'ADMIN'),
    );

    // El lock pesimista debe adquirirse antes de comprobar status (sin él, un
    // close concurrente podría colarse entre la lectura y el create).
    expect(calls).toEqual(['set_config', 'lock', 'read']);
  });

  it('RACE-02: 400 si la sesión pasó a CLOSED (el create no llega a ejecutarse)', async () => {
    const prisma = makePrisma();
    // Tras el lock, la relectura ve la sesión ya cerrada por el close concurrente.
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.createMovement(
          'cs-1',
          { type: 'OUT', amount: 10, reason: 'retirada' },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });
});

describe('CashSessionsService.listClosed', () => {
  it('devuelve las sesiones CLOSED de la tienda, recientes primero y con tope', async () => {
    const prisma = makePrisma();
    const rows = [{ id: 'cs-2' }, { id: 'cs-1' }];
    prisma.cashSession.findMany = vi.fn(async () => rows);
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.listClosed(STORE, 'user-1', 'ADMIN', 10),
    );

    expect(result).toBe(rows);
    const arg = prisma.cashSession.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      take: number;
    };
    expect(arg.where).toEqual({ storeId: STORE, organizationId: ORG, status: 'CLOSED' });
    expect(arg.orderBy).toEqual({ closedAt: 'desc' });
    expect(arg.take).toBe(10);
  });

  it('SEC-01: un CLERK sin acceso a la tienda recibe 403 y no consulta cierres', async () => {
    const prisma = makePrisma();
    prisma.userStore.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.listClosed(STORE, 'clerk-1', 'CLERK', 30),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.cashSession.findMany).not.toHaveBeenCalled();
  });
});

// ── #146 · flujo de aprobación ──────────────────────────────────────────────

describe('CashSessionsService.createMovement (alta directa APPROVED, #146)', () => {
  it('crea el movimiento ya APPROVED con requestedBy = reviewedBy = el actor', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.createMovement('cs-1', { type: 'IN', amount: 30, reason: 'fondo' }, 'admin-1', 'ADMIN'),
    );

    const arg = prisma.cashMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.status).toBe('APPROVED');
    expect(arg.data.requestedById).toBe('admin-1');
    expect(arg.data.reviewedById).toBe('admin-1');
    expect(arg.data.reviewedAt).toBeInstanceOf(Date);
  });

  it('TRANSFER_OUT directo fija targetStoreId = tienda central', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    prisma.store.findFirst = vi.fn(async () => ({ id: 'central-store' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.createMovement(
        'cs-1',
        { type: 'TRANSFER_OUT', amount: 50, reason: 'a central' },
        'admin-1',
        'ADMIN',
      ),
    );

    const arg = prisma.cashMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.type).toBe('TRANSFER_OUT');
    expect(arg.data.targetStoreId).toBe('central-store');
  });
});

describe('CashSessionsService.requestMovement (#146)', () => {
  it('crea el movimiento PENDING con requestedById y emite cash.movement.requested', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    const events = makeEvents();
    const service = makeService(prisma, events);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestMovement('cs-1', { type: 'OUT', amount: 20, reason: 'retirada' }, 'clerk-1', 'CLERK'),
    );

    const arg = prisma.cashMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.status).toBe('PENDING');
    expect(arg.data.requestedById).toBe('clerk-1');
    expect(arg.data.reviewedById).toBeUndefined();
    // El evento se publica tras el commit (afterCommit de withTenantTx).
    expect(events.publish).toHaveBeenCalledTimes(1);
    const [org, event] = events.publish.mock.calls[0]! as unknown as [string, { type: string }];
    expect(org).toBe(ORG);
    expect(event.type).toBe('cash.movement.requested');
  });

  it('TRANSFER_OUT fija targetStoreId = tienda central', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    prisma.store.findFirst = vi.fn(async () => ({ id: 'central-store' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestMovement(
        'cs-1',
        { type: 'TRANSFER_OUT', amount: 50, reason: 'a central' },
        'clerk-1',
        'CLERK',
      ),
    );

    const arg = prisma.cashMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.targetStoreId).toBe('central-store');
  });

  it('400 si no hay tienda central configurada para el traspaso', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    prisma.store.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.requestMovement(
          'cs-1',
          { type: 'TRANSFER_OUT', amount: 50, reason: 'a central' },
          'clerk-1',
          'CLERK',
        ),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it('400 si la propia tienda central intenta traspasarse a sí misma', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    // La central resuelta coincide con el origen de la sesión.
    prisma.store.findFirst = vi.fn(async () => ({ id: STORE }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.requestMovement(
          'cs-1',
          { type: 'TRANSFER_OUT', amount: 50, reason: 'a central' },
          'clerk-1',
          'CLERK',
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('404 si la sesión no existe', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.requestMovement('cs-1', { type: 'IN', amount: 10, reason: 'x' }, 'clerk-1', 'CLERK'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('400 si la caja está cerrada', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED', storeId: STORE }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.requestMovement('cs-1', { type: 'IN', amount: 10, reason: 'x' }, 'clerk-1', 'CLERK'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('SEC-01: un CLERK sin acceso a la tienda recibe 403 y no crea nada', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN', storeId: STORE }));
    prisma.userStore.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.requestMovement('cs-1', { type: 'IN', amount: 10, reason: 'x' }, 'clerk-9', 'CLERK'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });
});

describe('CashSessionsService.approveMovement (#146)', () => {
  it('transiciona PENDING → APPROVED con reviewedById y reviewedAt', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => ({
      id: 'cm-1',
      storeId: STORE,
      cashSessionId: 'cs-1',
      status: 'PENDING',
    }));
    prisma.cashSession.findFirst = vi.fn(async () => ({ status: 'OPEN' }));
    prisma.cashMovement.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashMovement.findFirstOrThrow = vi.fn(async () => ({ id: 'cm-1', status: 'APPROVED' }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.approveMovement('cm-1', 'mgr-1', 'MANAGER'),
    );

    const arg = prisma.cashMovement.updateMany.mock.calls[0]![0] as {
      where: { status: string };
      data: { status: string; reviewedById: string; reviewedAt: Date };
    };
    expect(arg.where.status).toBe('PENDING');
    expect(arg.data.status).toBe('APPROVED');
    expect(arg.data.reviewedById).toBe('mgr-1');
    expect(arg.data.reviewedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('404 si el movimiento no existe', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.approveMovement('cm-1', 'a', 'ADMIN')),
    ).rejects.toThrow(NotFoundException);
  });

  it('400 si la caja ya está cerrada (no se puede aprobar contra una sesión CLOSED)', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => ({
      id: 'cm-1',
      storeId: STORE,
      cashSessionId: 'cs-1',
      status: 'PENDING',
    }));
    prisma.cashSession.findFirst = vi.fn(async () => ({ status: 'CLOSED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.approveMovement('cm-1', 'a', 'ADMIN')),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cashMovement.updateMany).not.toHaveBeenCalled();
  });

  it('400 si el movimiento ya no está PENDING (updateMany afecta 0 filas)', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => ({
      id: 'cm-1',
      storeId: STORE,
      cashSessionId: 'cs-1',
      status: 'PENDING',
    }));
    prisma.cashSession.findFirst = vi.fn(async () => ({ status: 'OPEN' }));
    prisma.cashMovement.updateMany = vi.fn(async () => ({ count: 0 }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.approveMovement('cm-1', 'a', 'ADMIN')),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CashSessionsService.denyMovement (#146)', () => {
  it('transiciona PENDING → DENIED con reviewedById y reviewedAt', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => ({ id: 'cm-1', storeId: STORE }));
    prisma.cashMovement.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashMovement.findFirstOrThrow = vi.fn(async () => ({ id: 'cm-1', status: 'DENIED' }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.denyMovement('cm-1', 'mgr-1', 'MANAGER'),
    );

    const arg = prisma.cashMovement.updateMany.mock.calls[0]![0] as {
      where: { status: string };
      data: { status: string; reviewedById: string };
    };
    expect(arg.where.status).toBe('PENDING');
    expect(arg.data.status).toBe('DENIED');
    expect(arg.data.reviewedById).toBe('mgr-1');
    expect(result).toMatchObject({ status: 'DENIED' });
  });

  it('404 si el movimiento no existe', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.denyMovement('cm-1', 'a', 'ADMIN')),
    ).rejects.toThrow(NotFoundException);
  });

  it('400 si el movimiento ya no está PENDING (updateMany afecta 0 filas)', async () => {
    const prisma = makePrisma();
    prisma.cashMovement.findFirst = vi.fn(async () => ({ id: 'cm-1', storeId: STORE }));
    prisma.cashMovement.updateMany = vi.fn(async () => ({ count: 0 }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.denyMovement('cm-1', 'a', 'ADMIN')),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CashSessionsService.listPendingMovements (#146)', () => {
  it('lista los PENDING de la organización, recientes primero', async () => {
    const prisma = makePrisma();
    const rows = [{ id: 'cm-2' }, { id: 'cm-1' }];
    prisma.cashMovement.findMany = vi.fn(async () => rows);
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.listPendingMovements(),
    );

    expect(result).toBe(rows);
    const arg = prisma.cashMovement.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; status: string };
      orderBy: { createdAt: 'desc' };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.status).toBe('PENDING');
    expect(arg.orderBy.createdAt).toBe('desc');
  });
});

describe('CashSessionsService.close · solo cuenta APPROVED y auto-deniega PENDING (#146)', () => {
  it('la agregación filtra status APPROVED y se auto-deniegan los PENDING', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({
      id: 'cs-1',
      status: 'OPEN',
      storeId: STORE,
      openingAmount: 100,
      openedAt: new Date('2026-06-16T08:00:00Z'),
    }));
    prisma.sale.aggregate = vi.fn(async () => ({ _sum: { total: 0 } }));
    prisma.cashMovement.groupBy = vi.fn(async () => [{ type: 'IN', _sum: { amount: 40 } }]);
    prisma.cashSession.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.cashSession.findFirstOrThrow = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.close('cs-1', { countedAmount: 140 }, 'mgr-1', 'MANAGER'),
    );

    // La agregación de movimientos solo cuenta APPROVED.
    const groupArg = prisma.cashMovement.groupBy.mock.calls[0]![0] as {
      where: { status: string };
    };
    expect(groupArg.where.status).toBe('APPROVED');

    // Las solicitudes PENDING de la sesión se auto-deniegan en la misma tx.
    const denyArg = prisma.cashMovement.updateMany.mock.calls[0]![0] as {
      where: { cashSessionId: string; status: string };
      data: { status: string };
    };
    expect(denyArg.where.cashSessionId).toBe('cs-1');
    expect(denyArg.where.status).toBe('PENDING');
    expect(denyArg.data.status).toBe('DENIED');
  });
});
