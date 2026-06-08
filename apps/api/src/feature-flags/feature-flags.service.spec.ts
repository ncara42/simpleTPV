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
