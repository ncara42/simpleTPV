import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';

export interface CreateProductInput {
  name: string;
  salePrice: number;
  description?: string | null;
  barcode?: string | null;
  sku?: string | null;
  costPrice?: number;
  taxRate?: number;
  saleUnit?: 'UNIT' | 'WEIGHT' | 'VOLUME' | 'LENGTH';
  unitSymbol?: string;
  familyId?: string | null;
  active?: boolean;
}

export type UpdateProductInput = Partial<CreateProductInput>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductInput): Promise<unknown> {
    // RLS filtra lectura/escritura por la policy, pero el INSERT necesita el
    // organizationId explícito (lo toma del contexto de tenant del JWT).
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }
    return this.prisma.product.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  async findAll(search?: string, familyId?: string): Promise<unknown[]> {
    const where: Record<string, unknown> = {};
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { sku: { contains: search, mode: 'insensitive' as const } },
        { barcode: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (familyId) {
      where.familyId = familyId;
    }
    return this.prisma.product.findMany({
      ...(Object.keys(where).length ? { where } : {}),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<unknown> {
    const product = await this.prisma.product.findFirst({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto ${id} no encontrado`);
    }
    return product;
  }

  async update(id: string, input: UpdateProductInput): Promise<unknown> {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
  }
}
