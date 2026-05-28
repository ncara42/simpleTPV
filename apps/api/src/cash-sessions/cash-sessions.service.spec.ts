import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      create: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'cs-1' })),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'cs-1' })),
    },
    sale: {
      aggregate: vi.fn(
        async (_a?: unknown): Promise<{ _sum: { total: number | null } }> => ({
          _sum: { total: 0 },
        }),
      ),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new CashSessionsService(prisma as never);
}

describe('CashSessionsService.open', () => {
  it('lanza 400 si ya hay una caja abierta en la tienda', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-existing', status: 'OPEN' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.open({ storeId: STORE, openingAmount: 100 }, 'user-1'),
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
      service.open({ storeId: STORE, openingAmount: 100 }, 'user-1'),
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
    await expect(service.open({ storeId: STORE, openingAmount: 0 }, 'user-1')).rejects.toThrow();
  });
});

describe('CashSessionsService.close', () => {
  it('lanza 404 si la sesión no existe', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.close('nope', { countedAmount: 100 }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la sesión ya está cerrada', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'CLOSED' }));
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.close('cs-1', { countedAmount: 100 }),
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
      service.close('cs-1', { countedAmount: 360 }),
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
      service.close('cs-1', { countedAmount: 0 }),
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
        service.close('cs-1', { countedAmount: 100 }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CashSessionsService.current', () => {
  it('devuelve la sesión OPEN de la tienda', async () => {
    const prisma = makePrisma();
    prisma.cashSession.findFirst = vi.fn(async () => ({ id: 'cs-1', status: 'OPEN' }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () => service.current(STORE));

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

    const result = await tenantStorage.run({ organizationId: ORG }, () => service.current(STORE));
    expect(result).toBeNull();
  });
});
