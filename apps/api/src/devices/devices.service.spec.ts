import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { DevicesService } from './devices.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

function makePrisma() {
  return {
    store: {
      findFirst: vi.fn(async (_a?: unknown) => null as unknown),
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
    expect(arg.data.pairingToken).toMatch(/^[A-F0-9]{12}$/);
    expect(result.pairingToken).toMatch(/^[A-F0-9]{12}$/);
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
      tenantStorage.run({ organizationId: ORG }, () => service.pair('device-demo-token')),
    ).rejects.toThrow(NotFoundException);
  });

  it('pair autoriza el dispositivo y devuelve su forma pública', async () => {
    const prisma = makePrisma();
    prisma.officialDevice.findFirst = vi.fn(async () => ({
      id: 'dev-1',
      organizationId: ORG,
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
      service.pair('device-demo-token'),
    )) as { authorized: boolean; device: { id: string } | null };

    const arg = prisma.officialDevice.update.mock.calls[0]![0] as {
      data: { authorized: boolean };
    };
    expect(arg.data.authorized).toBe(true);
    expect(result.authorized).toBe(true);
    expect(result.device?.id).toBe('dev-1');
  });
});
