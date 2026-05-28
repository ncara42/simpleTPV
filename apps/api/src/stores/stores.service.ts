import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto.js';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStoreDto): Promise<Store> {
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

  async update(id: string, input: UpdateStoreDto): Promise<Store> {
    await this.findOne(id);
    return this.prisma.store.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.store.delete({ where: { id } });
  }
}
