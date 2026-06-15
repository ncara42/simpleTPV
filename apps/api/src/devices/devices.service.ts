import { createHash, randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { storeId: string; name: string }) {
    const tenant = requireTenant();
    const store = await this.prisma.store.findFirst({
      where: { id: input.storeId, organizationId: tenant.organizationId },
    });
    if (!store) {
      throw new NotFoundException(`Tienda ${input.storeId} no encontrada`);
    }
    // El token plano se devuelve UNA VEZ al crear; en BD solo se guarda su hash.
    const plainToken = this.newPairingToken();
    const device = await this.prisma.officialDevice.create({
      data: {
        organizationId: tenant.organizationId,
        storeId: input.storeId,
        name: input.name.trim(),
        pairingToken: this.hashToken(plainToken),
        authorized: false,
      },
    });
    return {
      ...this.publicDevice(device),
      pairingToken: plainToken,
      authorized: device.authorized,
    };
  }

  // Lista los dispositivos de la organización (opcionalmente de una tienda),
  // con su estado de emparejamiento. Para la gestión desde Tiendas (I-08).
  async findAll(storeId?: string) {
    const tenant = requireTenant();
    const devices = await this.prisma.officialDevice.findMany({
      where: { organizationId: tenant.organizationId, ...(storeId ? { storeId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => ({ ...this.publicDevice(d), authorized: d.authorized }));
  }

  // Revoca (elimina) un dispositivo: su token deja de autorizar el fichaje en el
  // TPV inmediatamente (status volverá authorized=false).
  async revoke(id: string): Promise<void> {
    const tenant = requireTenant();
    const device = await this.prisma.officialDevice.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Dispositivo ${id} no encontrado`);
    }
    await this.prisma.officialDevice.delete({ where: { id } });
  }

  async status(pairingToken?: string) {
    const tenant = requireTenant();
    if (!pairingToken) {
      return { authorized: false, device: null };
    }
    const device = await this.prisma.officialDevice.findFirst({
      where: { pairingToken: this.hashToken(pairingToken), organizationId: tenant.organizationId },
    });
    if (!device || !device.authorized) {
      return { authorized: false, device: null };
    }
    const updated = await this.prisma.officialDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    return { authorized: true, device: this.publicDevice(updated) };
  }

  async pair(pairingToken: string, caller: { userId: string; role: string }) {
    const tenant = requireTenant();
    const device = await this.prisma.officialDevice.findFirst({
      where: { pairingToken: this.hashToken(pairingToken), organizationId: tenant.organizationId },
    });
    if (!device) {
      throw new NotFoundException('Token de dispositivo no encontrado');
    }
    // BOLA intra-tenant (KEY-03): un CLERK solo empareja dispositivos de sus
    // tiendas. ADMIN/MANAGER operan sobre toda la organización (org-wide).
    await assertStoreAccess(this.prisma, {
      userId: caller.userId,
      role: caller.role,
      storeId: device.storeId,
    });
    const updated = await this.prisma.officialDevice.update({
      where: { id: device.id },
      data: { authorized: true, pairedAt: device.pairedAt ?? new Date(), lastSeenAt: new Date() },
    });
    return { authorized: true, device: this.publicDevice(updated) };
  }

  private publicDevice(device: {
    id: string;
    storeId: string;
    name: string;
    pairedAt: Date | null;
    lastSeenAt: Date | null;
  }) {
    return {
      id: device.id,
      storeId: device.storeId,
      name: device.name,
      pairedAt: device.pairedAt,
      lastSeenAt: device.lastSeenAt,
    };
  }

  private newPairingToken(): string {
    return randomBytes(6).toString('hex').toUpperCase();
  }

  // Hash determinista del token para buscar/persistir sin guardar el plano.
  private hashToken(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }
}
