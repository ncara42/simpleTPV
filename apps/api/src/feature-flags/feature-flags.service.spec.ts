import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { FeatureFlagService } from './feature-flags.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// Mock del cliente Prisma: solo featureFlag.findMany. `rows` son las filas que
// devolvería la BD (default de org con storeId null + overrides de tienda).
function makePrisma(rows: unknown[]) {
  return {
    featureFlag: {
      findMany: vi.fn(async (..._a: unknown[]) => rows),
    },
  };
}

describe('FeatureFlagService.isEnabled — precedencia tienda ?? org ?? código', () => {
  it('el override de la tienda gana sobre el default de la org y el del código', async () => {
    // Tienda apaga (false) lo que la org tiene encendido (true): manda la tienda.
    const prisma = makePrisma([
      { storeId: STORE, enabled: false },
      { storeId: null, enabled: true },
    ]);
    const service = new FeatureFlagService(prisma as never);

    const res = await run(() => service.isEnabled('blind_returns', STORE));

    expect(res).toBe(false);
    // El where usa OR (no `in`): trae el default de org (null) + el override de tienda.
    const where = (
      prisma.featureFlag.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ organizationId: ORG, key: 'blind_returns' });
    expect(where.OR).toEqual([{ storeId: STORE }, { storeId: null }]);
  });

  it('sin override de tienda, cae al default de la org', async () => {
    const prisma = makePrisma([{ storeId: null, enabled: false }]);
    const service = new FeatureFlagService(prisma as never);

    expect(await run(() => service.isEnabled('time_clock', STORE))).toBe(false);
  });

  it('sin filas, cae al default del código (comportamiento actual = activo)', async () => {
    const prisma = makePrisma([]);
    const service = new FeatureFlagService(prisma as never);

    expect(await run(() => service.isEnabled('blind_returns', STORE))).toBe(true);
  });

  it('un enabled=false explícito de org gana sobre el default true del código', async () => {
    const prisma = makePrisma([{ storeId: null, enabled: false }]);
    const service = new FeatureFlagService(prisma as never);

    // Sin storeId (módulo de central): resuelve org ?? código. El where filtra a NULL.
    expect(await run(() => service.isEnabled('b2b'))).toBe(false);
    const where = (
      prisma.featureFlag.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ organizationId: ORG, key: 'b2b', storeId: null });
  });

  it('módulo de central sin filas → default del código (activo)', async () => {
    const prisma = makePrisma([]);
    const service = new FeatureFlagService(prisma as never);

    expect(await run(() => service.isEnabled('data_export'))).toBe(true);
  });
});

describe('FeatureFlagService.assertEnabled', () => {
  it('no lanza si la key está activa', async () => {
    const prisma = makePrisma([{ storeId: STORE, enabled: true }]);
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.assertEnabled('blind_returns', STORE))).resolves.toBeUndefined();
  });

  it('lanza 403 si la key está apagada', async () => {
    const prisma = makePrisma([{ storeId: STORE, enabled: false }]);
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.assertEnabled('blind_returns', STORE))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('FeatureFlagService.resolveAll', () => {
  it('resuelve TODAS las keys con la precedencia tienda ?? org ?? código', async () => {
    // org apaga data_export; la tienda apaga time_clock; b2b sin fila (default true);
    // blind_returns con override de tienda a true.
    const prisma = makePrisma([
      { key: 'data_export', storeId: null, enabled: false },
      { key: 'time_clock', storeId: STORE, enabled: false },
      { key: 'time_clock', storeId: null, enabled: true },
      { key: 'blind_returns', storeId: STORE, enabled: true },
    ]);
    const service = new FeatureFlagService(prisma as never);

    const res = await run(() => service.resolveAll(STORE));

    expect(res).toEqual({
      blind_returns: true, // override de tienda
      time_clock: false, // override de tienda gana sobre org true
      data_export: false, // default de org
      b2b: true, // sin fila → default del código
    });
  });

  it('sin storeId resuelve solo los defaults de la org (where filtra a NULL)', async () => {
    const prisma = makePrisma([{ key: 'b2b', storeId: null, enabled: false }]);
    const service = new FeatureFlagService(prisma as never);

    const res = await run(() => service.resolveAll());

    expect(res.b2b).toBe(false);
    expect(res.blind_returns).toBe(true); // sin fila → default del código
    const where = (
      prisma.featureFlag.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ organizationId: ORG, storeId: null });
  });
});

// ── Gestión (#127 B slice 2) ──────────────────────────────────────────────────

const ADMIN = { userId: 'user-admin', role: 'ADMIN' };
const MANAGER = { userId: 'user-manager', role: 'MANAGER' };
const CLERK = { userId: 'user-clerk', role: 'CLERK' };

function makeMgmtPrisma(
  opts: { flags?: unknown[]; existing?: unknown; membership?: unknown } = {},
) {
  return {
    featureFlag: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.flags ?? []),
      findFirst: vi.fn(async (..._a: unknown[]) => opts.existing ?? null),
      update: vi.fn(async (args: unknown) => args),
      create: vi.fn(async (args: unknown) => args),
      deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
    userStore: { findFirst: vi.fn(async (..._a: unknown[]) => opts.membership ?? null) },
  };
}

describe('FeatureFlagService.list', () => {
  it('devuelve el catálogo (4 módulos) + las filas explícitas del tenant', async () => {
    const flags = [{ key: 'b2b', storeId: null, enabled: false }];
    const prisma = makeMgmtPrisma({ flags });
    const service = new FeatureFlagService(prisma as never);

    const res = await run(() => service.list());

    expect(res.flags).toEqual(flags);
    expect(res.catalog).toHaveLength(4);
    expect(res.catalog.map((c) => c.key).sort()).toEqual([
      'b2b',
      'blind_returns',
      'data_export',
      'time_clock',
    ]);
    expect(res.catalog.every((c) => c.default === true)).toBe(true);
  });
});

describe('FeatureFlagService.setFlag', () => {
  it('crea el flag de org si no existe (storeId null)', async () => {
    const prisma = makeMgmtPrisma({ existing: null });
    const service = new FeatureFlagService(prisma as never);

    await run(() => service.setFlag('b2b', false, undefined, ADMIN));

    expect(prisma.featureFlag.update).not.toHaveBeenCalled();
    const data = (prisma.featureFlag.create.mock.calls[0]![0] as { data: Record<string, unknown> })
      .data;
    expect(data).toEqual({ organizationId: ORG, key: 'b2b', storeId: null, enabled: false });
  });

  it('actualiza el flag existente por id (no crea otro)', async () => {
    const prisma = makeMgmtPrisma({ existing: { id: 'ff-1' } });
    const service = new FeatureFlagService(prisma as never);

    await run(() => service.setFlag('time_clock', true, STORE, ADMIN));

    expect(prisma.featureFlag.create).not.toHaveBeenCalled();
    expect(prisma.featureFlag.update).toHaveBeenCalledWith({
      where: { id: 'ff-1' },
      data: { enabled: true },
    });
  });

  it('un override de tienda con un rol no org-wide sin acceso recibe 403 (SEC-01)', async () => {
    const prisma = makeMgmtPrisma({ membership: null });
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.setFlag('blind_returns', false, STORE, CLERK))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.featureFlag.create).not.toHaveBeenCalled();
    expect(prisma.featureFlag.update).not.toHaveBeenCalled();
  });

  it('un MANAGER NO puede cambiar un flag a nivel org (sin storeId) → 403 (least privilege)', async () => {
    const prisma = makeMgmtPrisma({ existing: null });
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.setFlag('b2b', false, undefined, MANAGER))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.featureFlag.create).not.toHaveBeenCalled();
    expect(prisma.featureFlag.update).not.toHaveBeenCalled();
  });

  it('un MANAGER SÍ puede gestionar un flag de tienda (org-wide para tiendas, SEC-01)', async () => {
    const prisma = makeMgmtPrisma({ existing: null });
    const service = new FeatureFlagService(prisma as never);

    await run(() => service.setFlag('blind_returns', false, STORE, MANAGER));

    expect(prisma.featureFlag.create).toHaveBeenCalled();
  });
});

describe('FeatureFlagService.clearFlag', () => {
  it('borra el flag (org si no hay storeId) filtrando por organización', async () => {
    const prisma = makeMgmtPrisma();
    const service = new FeatureFlagService(prisma as never);

    await run(() => service.clearFlag('b2b', undefined, ADMIN));

    const where = (
      prisma.featureFlag.deleteMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toEqual({ organizationId: ORG, key: 'b2b', storeId: null });
  });

  it('quitar un override de tienda sin acceso recibe 403 antes de borrar (SEC-01)', async () => {
    const prisma = makeMgmtPrisma({ membership: null });
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.clearFlag('time_clock', STORE, CLERK))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.featureFlag.deleteMany).not.toHaveBeenCalled();
  });

  it('un MANAGER NO puede quitar un flag a nivel org (sin storeId) → 403', async () => {
    const prisma = makeMgmtPrisma();
    const service = new FeatureFlagService(prisma as never);

    await expect(run(() => service.clearFlag('b2b', undefined, MANAGER))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.featureFlag.deleteMany).not.toHaveBeenCalled();
  });
});
