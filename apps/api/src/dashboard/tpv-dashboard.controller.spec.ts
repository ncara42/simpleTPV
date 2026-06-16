import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DashboardService } from './dashboard.service.js';
import { TpvDashboardController } from './tpv-dashboard.controller.js';

const STORE = '11111111-1111-1111-1111-111111111111';

// Fachada del TPV: delega en DashboardService.salesToday con compare=day por
// defecto, pero ANTES acota el acceso por tienda (SEC-01): un CLERK solo ve el
// recuento de una tienda a la que está asignado; ADMIN/MANAGER acceden a toda la org.
function makeController(membership: { storeId: string } | null = { storeId: STORE }): {
  controller: TpvDashboardController;
  service: { salesToday: ReturnType<typeof vi.fn> };
  prisma: { userStore: { findFirst: ReturnType<typeof vi.fn> } };
} {
  const service = { salesToday: vi.fn().mockResolvedValue('salesToday') };
  const prisma = {
    userStore: { findFirst: vi.fn(async () => membership) },
  };
  return {
    controller: new TpvDashboardController(
      service as unknown as DashboardService,
      prisma as unknown as PrismaService,
    ),
    service,
    prisma,
  };
}

function req(role: string): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: 'org-1', role } };
}

describe('TpvDashboardController', () => {
  it('CLERK con tienda asignada: comprueba acceso y delega (compare=day)', async () => {
    const { controller, service, prisma } = makeController({ storeId: STORE });

    await expect(controller.salesToday(req('CLERK'), { storeId: STORE })).resolves.toBe(
      'salesToday',
    );

    expect(prisma.userStore.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', storeId: STORE },
      select: { storeId: true },
    });
    expect(service.salesToday).toHaveBeenCalledWith(STORE, 'day');
  });

  it('CLERK con tienda NO asignada: 403 y no delega (IDOR horizontal)', async () => {
    const { controller, service } = makeController(null);

    await expect(controller.salesToday(req('CLERK'), { storeId: STORE })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.salesToday).not.toHaveBeenCalled();
  });

  it('CLERK sin storeId: 403 (no puede ver el agregado de la organización)', async () => {
    const { controller, service } = makeController();

    await expect(controller.salesToday(req('CLERK'), {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.salesToday).not.toHaveBeenCalled();
  });

  it('ADMIN sin storeId: delega el agregado de la org sin comprobar tienda', async () => {
    const { controller, service, prisma } = makeController();

    await controller.salesToday(req('ADMIN'), {});

    expect(prisma.userStore.findFirst).not.toHaveBeenCalled();
    expect(service.salesToday).toHaveBeenCalledWith(undefined, 'day');
  });

  it('MANAGER con storeId: exento de la comprobación de tienda (org-wide) y delega', async () => {
    const { controller, service, prisma } = makeController();

    await controller.salesToday(req('MANAGER'), { storeId: STORE, compare: 'month' });

    // assertStoreAccess sale temprano para roles org-wide: no consulta UserStore.
    expect(prisma.userStore.findFirst).not.toHaveBeenCalled();
    expect(service.salesToday).toHaveBeenCalledWith(STORE, 'month');
  });
});
