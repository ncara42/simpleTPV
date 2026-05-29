import { Injectable, NotFoundException } from '@nestjs/common';
import type { Supplier } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateSupplierDto, UpdateSupplierDto } from './suppliers.dto.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSupplierDto): Promise<Supplier> {
    const tenant = requireTenant();
    return this.prisma.supplier.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  async findAll(): Promise<Supplier[]> {
    const tenant = requireTenant();
    return this.prisma.supplier.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<Supplier> {
    const tenant = requireTenant();
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!supplier) {
      throw new NotFoundException(`Proveedor ${id} no encontrado`);
    }
    return supplier;
  }

  async update(id: string, input: UpdateSupplierDto): Promise<Supplier> {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.supplier.delete({ where: { id } });
  }
}
