import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { PromotionsService } from './promotions.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

function makePrisma(opts: { existing?: unknown; list?: unknown[] } = {}) {
  return {
    promotion: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'p1',
        ...args.data,
      })),
      findMany: vi.fn(async (..._a: unknown[]) => opts.list ?? []),
      findFirst: vi.fn(async (..._a: unknown[]) => opts.existing ?? null),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn(async (..._a: unknown[]) => undefined),
    },
  };
}

const BASE = {
  name: '2 productos → 15%',
  conditionType: 'min_qty' as const,
  threshold: 2,
  discountType: 'percent' as const,
  discountValue: 15,
  startDate: '2026-05-20',
  endDate: '2026-06-30',
};

describe('PromotionsService.create', () => {
  it('inyecta el organizationId del tenant y convierte las fechas a Date', async () => {
    const prisma = makePrisma();
    const service = new PromotionsService(prisma as never);

    await run(() => service.create({ ...BASE }));

    const data = prisma.promotion.create.mock.calls[0]![0].data;
    expect(data.organizationId).toBe(ORG);
    expect(data.startDate).toBeInstanceOf(Date);
    expect(data.endDate).toBeInstanceOf(Date);
    expect((data.startDate as Date).toISOString().slice(0, 10)).toBe('2026-05-20');
    expect(data.active).toBe(true); // default cuando no se envía
  });

  it('respeta active=false explícito', async () => {
    const prisma = makePrisma();
    const service = new PromotionsService(prisma as never);

    await run(() => service.create({ ...BASE, active: false }));

    expect(prisma.promotion.create.mock.calls[0]![0].data.active).toBe(false);
  });
});

describe('PromotionsService.findAll', () => {
  it('lista por createdAt desc (RLS acota al tenant)', async () => {
    const prisma = makePrisma({ list: [{ id: 'p1' }, { id: 'p2' }] });
    const service = new PromotionsService(prisma as never);

    const res = await run(() => service.findAll());

    expect(res).toHaveLength(2);
    expect(prisma.promotion.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });
});

describe('PromotionsService.findOne / update / remove', () => {
  it('findOne lanza 404 si no existe', async () => {
    const prisma = makePrisma({ existing: null });
    const service = new PromotionsService(prisma as never);

    await expect(run(() => service.findOne('p1'))).rejects.toThrow(NotFoundException);
  });

  it('update solo escribe los campos enviados y convierte fechas', async () => {
    const prisma = makePrisma({ existing: { id: 'p1' } });
    const service = new PromotionsService(prisma as never);

    await run(() => service.update('p1', { active: false, endDate: '2026-07-01' }));

    const args = prisma.promotion.update.mock.calls[0]![0];
    expect(args.where).toEqual({ id: 'p1' });
    expect(args.data.active).toBe(false);
    expect(args.data.endDate).toBeInstanceOf(Date);
    expect('name' in args.data).toBe(false); // no se envió → no se toca
  });

  it('update lanza 404 si no existe', async () => {
    const prisma = makePrisma({ existing: null });
    const service = new PromotionsService(prisma as never);

    await expect(run(() => service.update('p1', { active: false }))).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.promotion.update).not.toHaveBeenCalled();
  });

  it('remove borra tras comprobar que existe', async () => {
    const prisma = makePrisma({ existing: { id: 'p1' } });
    const service = new PromotionsService(prisma as never);

    await run(() => service.remove('p1'));

    expect(prisma.promotion.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
