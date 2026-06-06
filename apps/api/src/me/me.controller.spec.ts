import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StoresService } from '../stores/stores.service.js';
import { MeController } from './me.controller.js';
import type { PreferencesService } from './preferences.service.js';

const STORE_1 = '11111111-1111-1111-1111-111111111111';
const STORE_2 = '22222222-2222-2222-2222-222222222222';

function makeController() {
  const stores = {
    findAll: vi.fn(async () => [{ id: STORE_1, name: 'Tienda Centro' }]),
  };
  const prisma = {
    userStore: {
      findMany: vi.fn(async () => [{ storeId: STORE_1 }, { storeId: STORE_2 }]),
    },
  };
  const prefs = {
    getAll: vi.fn(async () => ({ 'dashboard.cards': { hidden: ['kpi-upt'] } })),
    set: vi.fn(async (_u: string, key: string, value: unknown) => ({ key, value })),
  };

  return {
    controller: new MeController(
      stores as unknown as StoresService,
      prisma as unknown as PrismaService,
      prefs as unknown as PreferencesService,
    ),
    prisma,
    stores,
    prefs,
  };
}

function req(user: JwtPayload): { user: JwtPayload } {
  return { user };
}

describe('MeController', () => {
  it('GET /me/stores delega en StoresService.findAll', async () => {
    const { controller, stores } = makeController();

    const res = await controller.findStores();

    expect(stores.findAll).toHaveBeenCalledOnce();
    expect(res).toEqual([{ id: STORE_1, name: 'Tienda Centro' }]);
  });

  it('GET /me devuelve rol y tiendas asignadas del usuario autenticado', async () => {
    const { controller, prisma } = makeController();

    const res = await controller.me(
      req({ sub: 'user-1', organizationId: 'org-1', role: 'MANAGER' }),
    );

    expect(prisma.userStore.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { storeId: true },
    });
    expect(res).toEqual({ role: 'MANAGER', storeIds: [STORE_1, STORE_2] });
  });

  it('GET /me/preferences delega en PreferencesService con el sub del usuario', async () => {
    const { controller, prefs } = makeController();
    const res = await controller.preferences(
      req({ sub: 'u-1', organizationId: 'o-1', role: 'CLERK' }),
    );
    expect(prefs.getAll).toHaveBeenCalledWith('u-1');
    expect(res).toEqual({ 'dashboard.cards': { hidden: ['kpi-upt'] } });
  });

  it('PUT /me/preferences/:key hace upsert con clave válida', async () => {
    const { controller, prefs } = makeController();
    const res = await controller.setPreference(
      req({ sub: 'u-1', organizationId: 'o-1', role: 'CLERK' }),
      'dashboard.cards',
      { value: { hidden: [] } },
    );
    expect(prefs.set).toHaveBeenCalledWith('u-1', 'dashboard.cards', { hidden: [] });
    expect(res).toEqual({ key: 'dashboard.cards', value: { hidden: [] } });
  });

  it('PUT /me/preferences/:key rechaza una clave no válida', () => {
    const { controller, prefs } = makeController();
    expect(() =>
      controller.setPreference(
        req({ sub: 'u-1', organizationId: 'o-1', role: 'CLERK' }),
        'mala clave!',
        { value: 1 },
      ),
    ).toThrow(BadRequestException);
    expect(prefs.set).not.toHaveBeenCalled();
  });
});
