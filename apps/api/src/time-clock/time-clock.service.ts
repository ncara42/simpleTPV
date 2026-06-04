import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TimeClockType } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';

@Injectable()
export class TimeClockService {
  constructor(private readonly prisma: PrismaService) {}

  async current(storeId: string, userId: string) {
    const tenant = requireTenant();
    return this.prisma.timeClockEntry.findFirst({
      where: { organizationId: tenant.organizationId, storeId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    input: { storeId: string; deviceId?: string; type: TimeClockType },
    userId: string,
    role: string,
  ) {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo ficha en sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId: input.storeId });
    if (!input.deviceId) {
      throw new ForbiddenException('Este TPV no está autorizado como dispositivo oficial');
    }
    const device = await this.prisma.officialDevice.findFirst({
      where: {
        id: input.deviceId,
        storeId: input.storeId,
        organizationId: tenant.organizationId,
        authorized: true,
      },
    });
    if (!device) {
      throw new NotFoundException('Dispositivo oficial no autorizado para esta tienda');
    }
    return this.prisma.timeClockEntry.create({
      data: {
        organizationId: tenant.organizationId,
        storeId: input.storeId,
        userId,
        deviceId: input.deviceId,
        type: input.type,
      },
    });
  }
}
