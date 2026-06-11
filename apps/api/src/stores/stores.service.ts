import { Injectable, NotFoundException } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto.js';

// El actor que gestiona el estado operativo: lo necesita assertStoreAccess para
// acotar a un MANAGER a sus tiendas (SEC-01).
type StoreOpsActor = { userId: string; role: string };

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStoreDto): Promise<Store> {
    const tenant = requireTenant();
    return this.prisma.store.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  // Estado operativo manual (I-09): verificada + incidencia, con marca de tiempo.
  async updateOps(
    id: string,
    input: { verified?: boolean; incident?: string | null },
    actor: StoreOpsActor,
  ): Promise<Store> {
    await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId: id });
    const tenant = requireTenant();
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true },
    });
    if (!store) {
      throw new NotFoundException(`Tienda ${id} no encontrada`);
    }
    return this.prisma.store.update({
      where: { id },
      data: {
        ...(input.verified !== undefined ? { opsVerified: input.verified } : {}),
        ...(input.incident !== undefined ? { opsIncident: input.incident || null } : {}),
        opsUpdatedAt: new Date(),
      },
    });
  }

  async findAll(): Promise<Store[]> {
    return this.prisma.store.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id } });
    if (!store) {
      throw new NotFoundException(`Tienda ${id} no encontrada`);
    }
    return store;
  }

  async update(id: string, input: UpdateStoreDto): Promise<Store> {
    await this.findOne(id);
    return this.prisma.store.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.store.delete({ where: { id } });
  }
}
