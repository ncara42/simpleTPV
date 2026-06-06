import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreatePriceListDto, SetPriceListItemDto, UpdatePriceListDto } from './b2b.dto.js';

// Tarifas (listas de precios) y sus precios por producto (IT-17). RLS por tenant.
@Injectable()
export class PriceListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const { organizationId } = requireTenant();
    const rows = await this.prisma.priceList.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true, customers: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      itemCount: r._count.items,
      customerCount: r._count.customers,
    }));
  }

  async get(id: string) {
    const { organizationId } = requireTenant();
    return this.prisma.priceList.findFirst({
      where: { id, organizationId },
      include: {
        items: {
          orderBy: { product: { name: 'asc' } },
          include: { product: { select: { name: true, salePrice: true } } },
        },
      },
    });
  }

  async create(dto: CreatePriceListDto) {
    const { organizationId } = requireTenant();
    return this.prisma.priceList.create({ data: { organizationId, name: dto.name } });
  }

  async update(id: string, dto: UpdatePriceListDto) {
    const { organizationId } = requireTenant();
    await this.prisma.priceList.updateMany({
      where: { id, organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.prisma.priceList.findFirst({ where: { id, organizationId } });
  }

  async remove(id: string): Promise<void> {
    const { organizationId } = requireTenant();
    // Borrar la tarifa cascadea sus items; los clientes con esa tarifa quedan a null.
    await this.prisma.priceList.deleteMany({ where: { id, organizationId } });
  }

  // Upsert de un precio de la tarifa. Verifica que tarifa y producto son del tenant.
  async setItem(priceListId: string, dto: SetPriceListItemDto) {
    const { organizationId } = requireTenant();
    const pl = await this.prisma.priceList.findFirst({
      where: { id: priceListId, organizationId },
      select: { id: true },
    });
    if (!pl) throw new BadRequestException('Tarifa no encontrada.');
    const prod = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId },
      select: { id: true },
    });
    if (!prod) throw new BadRequestException('Producto no encontrado.');
    return this.prisma.priceListItem.upsert({
      where: { priceListId_productId: { priceListId, productId: dto.productId } },
      create: { organizationId, priceListId, productId: dto.productId, price: dto.price },
      update: { price: dto.price },
    });
  }

  async removeItem(priceListId: string, productId: string): Promise<void> {
    const { organizationId } = requireTenant();
    await this.prisma.priceListItem.deleteMany({
      where: { priceListId, productId, organizationId },
    });
  }
}
