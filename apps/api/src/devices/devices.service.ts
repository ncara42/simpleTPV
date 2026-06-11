import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

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
    const device = await this.prisma.officialDevice.create({
      data: {
        organizationId: tenant.organizationId,
        storeId: input.storeId,
        name: input.name.trim(),
        pairingToken: this.newPairingToken(),
        authorized: false,
      },
    });
    return {
      ...this.publicDevice(device),
      pairingToken: device.pairingToken,
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
      where: { pairingToken, organizationId: tenant.organizationId },
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

  async pair(pairingToken: string) {
    const tenant = requireTenant();
    const device = await this.prisma.officialDevice.findFirst({
      where: { pairingToken, organizationId: tenant.organizationId },
    });
    if (!device) {
      throw new NotFoundException('Token de dispositivo no encontrado');
    }
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
}
