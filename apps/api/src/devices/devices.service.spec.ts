import { createHash } from 'node:crypto';

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { DevicesService } from './devices.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';
const ADMIN = { userId: 'u-admin', role: 'ADMIN' };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makePrisma() {
  return {
    store: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
    },
    userStore: {
      // Por defecto, el CLERK tiene acceso a la tienda (devuelve membership).
      findFirst: vi.fn(async (_a?: unknown) => ({ storeId: STORE }) as unknown),
    },
    officialDevice: {
      create: vi.fn(async (_a?: unknown) => ({ id: 'dev-1' }) as unknown),
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
      update: vi.fn(async (_a?: unknown) => ({ id: 'dev-1' }) as unknown),
      delete: vi.fn(async (_a?: unknown) => ({ id: 'dev-1' }) as unknown),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new DevicesService(prisma as never);
}

describe('DevicesService', () => {
  it('create lanza 404 si la tienda no existe', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ storeId: STORE, name: 'TPV Centro' }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('create persiste el dispositivo con token y nombre saneado', async () => {
    const prisma = makePrisma();
    prisma.store.findFirst = vi.fn(async () => ({ id: STORE }));
    prisma.officialDevice.create = vi.fn(async (a?: unknown) => ({
      id: 'dev-1',
      pairingToken: (a as { data: { pairingToken: string } }).data.pairingToken,
      authorized: false,
      storeId: STORE,
      name: 'TPV Centro',
      pairedAt: null,
      lastSeenAt: null,
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ storeId: STORE, name: '  TPV Centro  ' }),
    )) as Record<string, unknown>;

    const arg = prisma.officialDevice.create.mock.calls[0]![0] as {
      data: { organizationId: string; storeId: string; name: string; pairingToken: string };
    };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.storeId).toBe(STORE);
    expect(arg.data.name).toBe('TPV Centro');
    // En BD se persiste el HASH sha256 del token (64 hex), nunca el plano.
    expect(arg.data.pairingToken).toMatch(/^[a-f0-9]{64}$/);
    // En la respuesta de creación se devuelve el token PLANO (12 hex mayúsculas).
    expect(result.pairingToken).toMatch(/^[A-F0-9]{12}$/);
    // El hash persistido es sha256 del plano devuelto.
    expect(arg.data.pairingToken).toBe(sha256(result.pairingToken as string));
  });

  it('status sin token devuelve no autorizado', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () => service.status());

    expect(result).toEqual({ authorized: false, device: null });
  });

  it('status con token no autorizado devuelve no autorizado', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({ id: 'dev-1', authorized: false }));
    const service = makeService(prisma);

    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.status('device-demo-token'),
    );

    expect(result).toEqual({ authorized: false, device: null });
  });

  it('status con token autorizado actualiza lastSeen y devuelve el dispositivo público', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({
      id: 'dev-1',
      organizationId: ORG,
      storeId: STORE,
      name: 'TPV Centro',
      authorized: true,
    }));
    prisma.officialDevice.update = vi.fn(async () => ({
      id: 'dev-1',
      storeId: STORE,
      name: 'TPV Centro',
      pairedAt: null,
      lastSeenAt: new Date('2026-06-03T09:00:00.000Z'),
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.status('device-demo-token'),
    )) as { authorized: boolean; device: { id: string } | null };

    expect(prisma.officialDevice.update).toHaveBeenCalled();
    expect(result.authorized).toBe(true);
    expect(result.device?.id).toBe('dev-1');
    // status también busca por el HASH del token, no por el plano.
    const where = (
      prisma.officialDevice.findFirst.mock.calls[0]![0] as {
        where: { pairingToken: string };
      }
    ).where;
    expect(where.pairingToken).toBe(sha256('device-demo-token'));
  });

  it('findAll lista los dispositivos del tenant (con filtro por tienda) y su estado', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findMany = vi.fn(async (args?: unknown) => {
      const where = (args as { where: Record<string, unknown> }).where;
      expect(where.organizationId).toBe(ORG);
      expect(where.storeId).toBe(STORE);
      return [
        {
          id: 'dev-1',
          storeId: STORE,
          name: 'TPV mostrador',
          authorized: true,
          pairedAt: new Date('2026-06-01'),
          lastSeenAt: null,
          pairingToken: 'SECRETO',
        },
      ];
    });
    const service = makeService(prisma);
    const res = await tenantStorage.run({ organizationId: ORG }, () => service.findAll(STORE));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 'dev-1', name: 'TPV mostrador', authorized: true });
    // El token NUNCA se expone en el listado (solo al crearlo).
    expect((res[0] as { pairingToken?: string }).pairingToken).toBeUndefined();
  });

  it('revoke elimina el dispositivo del tenant y 404 si no existe', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({ id: 'dev-1' }));
    const service = makeService(prisma);
    await tenantStorage.run({ organizationId: ORG }, () => service.revoke('dev-1'));
    expect(prisma.officialDevice.delete).toHaveBeenCalledWith({ where: { id: 'dev-1' } });

    prisma.officialDevice.findFirst = vi.fn(async () => null);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.revoke('nope')),
    ).rejects.toThrow(NotFoundException);
  });

  it('pair lanza 404 si el token no existe', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.pair('ABCDEF012345', ADMIN)),
    ).rejects.toThrow(NotFoundException);
  });

  it('pair busca por el HASH del token, nunca por el plano', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await tenantStorage
      .run({ organizationId: ORG }, () => service.pair('ABCDEF012345', ADMIN))
      .catch(() => undefined);

    const where = (
      prisma.officialDevice.findFirst.mock.calls[0]![0] as { where: { pairingToken: string } }
    ).where;
    expect(where.pairingToken).toBe(sha256('ABCDEF012345'));
    expect(where.pairingToken).not.toBe('ABCDEF012345');
  });

  it('pair autoriza el dispositivo y devuelve su forma pública', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({
      id: 'dev-1',
      organizationId: ORG,
      storeId: STORE,
      pairedAt: null,
    }));
    prisma.officialDevice.update = vi.fn(async () => ({
      id: 'dev-1',
      storeId: STORE,
      name: 'TPV Centro',
      pairedAt: new Date('2026-06-03T09:00:00.000Z'),
      lastSeenAt: new Date('2026-06-03T09:00:00.000Z'),
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.pair('ABCDEF012345', ADMIN),
    )) as { authorized: boolean; device: { id: string } | null };

    const arg = prisma.officialDevice.update.mock.calls[0]![0] as {
      data: { authorized: boolean };
    };
    expect(arg.data.authorized).toBe(true);
    expect(result.authorized).toBe(true);
    expect(result.device?.id).toBe('dev-1');
  });

  it('pair lanza 403 si un CLERK empareja un dispositivo de una tienda ajena (BOLA)', async () => {
    const prisma = makePrisma();
    // El dispositivo existe (token válido) pero es de otra tienda...
    prisma.officialDevice.findFirst = vi.fn(async () => ({
      id: 'dev-otra',
      organizationId: ORG,
      storeId: 'store-ajena',
      pairedAt: null,
    }));
    // ...y el CLERK no tiene asignación a esa tienda → sin membership.
    prisma.userStore.findFirst = vi.fn(async () => null);
    const service = makeService(prisma);

    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.pair('ABCDEF012345', { userId: 'u-clerk', role: 'CLERK' }),
      ),
    ).rejects.toThrow(ForbiddenException);
    // No se autoriza el dispositivo si el acceso a la tienda falla.
    expect(prisma.officialDevice.update).not.toHaveBeenCalled();
  });

  it('pair permite a un CLERK con asignación a la tienda del dispositivo', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({
      id: 'dev-1',
      organizationId: ORG,
      storeId: STORE,
      pairedAt: null,
    }));
    prisma.userStore.findFirst = vi.fn(async () => ({ storeId: STORE }));
    prisma.officialDevice.update = vi.fn(async () => ({
      id: 'dev-1',
      storeId: STORE,
      name: 'TPV Centro',
      pairedAt: new Date('2026-06-03T09:00:00.000Z'),
      lastSeenAt: new Date('2026-06-03T09:00:00.000Z'),
    }));
    const service = makeService(prisma);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.pair('ABCDEF012345', { userId: 'u-clerk', role: 'CLERK' }),
    )) as { authorized: boolean };

    expect(result.authorized).toBe(true);
    // La comprobación filtra por el userId del CLERK y la tienda del dispositivo.
    const where = (
      prisma.userStore.findFirst.mock.calls[0]![0] as {
        where: { userId: string; storeId: string };
      }
    ).where;
    expect(where).toEqual({ userId: 'u-clerk', storeId: STORE });
  });
});
