import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { tenantStorage } from '../prisma/tenant-context.js';
import { ZReportService } from './z-report.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

function makePrisma() {
  return {
    store: {
      findFirst: vi.fn(
        async (_a?: unknown): Promise<unknown> => ({
          id: STORE,
          name: 'Tienda Centro',
          code: '01',
        }),
      ),
    },
    sale: {
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
    },
    userStore: {
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => null),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ZReportService(prisma as unknown as PrismaService);
}

describe('ZReportService.getZReport', () => {
  it('lanza 404 si la tienda no existe en el tenant', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.getZReport(STORE, '2026-06-07', 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('un CLERK sin acceso a la tienda recibe 403 (SEC-01)', async () => {
    const prisma = makePrisma();
    // userStore.findFirst → null: el CLERK no está asignado a la tienda.
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.getZReport(STORE, '2026-06-07', 'clerk-1', 'CLERK'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza una fecha imposible que pasa el regex del DTO (400)', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.getZReport(STORE, '2026-13-45', 'user-1', 'ADMIN'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('construye el cierre Z con los desgloses del día', async () => {
    const prisma = makePrisma();
    prisma.sale.findMany = vi.fn(async () => [
      {
        ticketNumber: 'T01-000001',
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        subtotal: 121,
        total: 121,
        discountTotal: 0,
        lines: [{ taxRate: 21, lineTotal: 121 }],
      },
      {
        ticketNumber: 'T01-000002',
        status: 'COMPLETED',
        paymentMethod: 'CARD',
        subtotal: 110,
        total: 110,
        discountTotal: 0,
        lines: [{ taxRate: 10, lineTotal: 110 }],
      },
    ]);
    const service = makeService(prisma);

    const z = await tenantStorage.run({ organizationId: ORG }, () =>
      service.getZReport(STORE, '2026-06-07', 'user-1', 'ADMIN'),
    );

    expect(z.store.code).toBe('01');
    expect(z.ticketCount).toBe(2);
    expect(z.total).toBeCloseTo(231, 2);
    expect(z.taxBreakdown.map((t) => t.taxRate)).toEqual([10, 21]);
    expect(z.paymentBreakdown.map((p) => p.paymentMethod)).toEqual(['CARD', 'CASH']);

    // Filtra por organizationId, storeId y el rango UTC del día (defensa en profundidad).
    const arg = prisma.sale.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; storeId: string; createdAt: { gte: Date; lt: Date } };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.storeId).toBe(STORE);
    expect(arg.where.createdAt.gte.toISOString()).toBe('2026-06-07T00:00:00.000Z');
    expect(arg.where.createdAt.lt.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});
