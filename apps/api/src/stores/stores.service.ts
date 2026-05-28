import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';

export interface CreateStoreInput {
  name: string;
  address?: string | null;
  active?: boolean;
}

export type UpdateStoreInput = Partial<CreateStoreInput>;

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStoreInput): Promise<Store> {
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }
    return this.prisma.store.create({
      data: { ...input, organizationId: tenant.organizationId },
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

  async update(id: string, input: UpdateStoreInput): Promise<Store> {
    await this.findOne(id);
    return this.prisma.store.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.store.delete({ where: { id } });
  }
}
