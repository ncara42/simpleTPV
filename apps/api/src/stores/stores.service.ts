import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto.js';

// El actor que gestiona el estado operativo: lo necesita assertStoreAccess para
// acotar a un MANAGER a sus tiendas (SEC-01).
type StoreOpsActor = { userId: string; role: string };

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
  ) {}

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

  /**
   * Designa (o desmarca) la tienda central de la organización (#146 D-1). Solo
   * puede haber UNA central por organización, garantizado por el índice único
   * parcial `one_central_per_org`. Para no chocar con él, desmarca la central
   * anterior ANTES de marcar la nueva, todo en UNA transacción con el tenant
   * fijado (escritura multi-fila atómica + RLS). Con isCentral=false la org se
   * queda sin central.
   */
  async setCentral(id: string, isCentral: boolean): Promise<Store> {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id, organizationId: tenant.organizationId },
        select: { id: true },
      });
      if (!store) {
        throw new NotFoundException(`Tienda ${id} no encontrada`);
      }
      if (isCentral) {
        await tx.store.updateMany({
          where: { organizationId: tenant.organizationId, isCentral: true, id: { not: id } },
          data: { isCentral: false },
        });
      }
      await tx.store.update({ where: { id }, data: { isCentral } });
      return tx.store.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
      });
    });
  }
}
