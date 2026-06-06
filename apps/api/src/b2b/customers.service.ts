import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateCustomerDto, UpdateCustomerDto } from './b2b.dto.js';

// Clientes B2B (IT-17). RLS aísla por tenant; además verificamos que la tarifa
// asignada sea del propio tenant (la FK solo comprueba que el id exista).
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPriceListInOrg(priceListId: string, organizationId: string): Promise<void> {
    const pl = await this.prisma.priceList.findFirst({
      where: { id: priceListId, organizationId },
      select: { id: true },
    });
    if (!pl) throw new BadRequestException('La tarifa no existe en la organización.');
  }

  async list() {
    const { organizationId } = requireTenant();
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { priceList: { select: { id: true, name: true } } },
    });
  }

  async create(dto: CreateCustomerDto) {
    const { organizationId } = requireTenant();
    if (dto.priceListId) await this.assertPriceListInOrg(dto.priceListId, organizationId);
    return this.prisma.customer.create({
      data: {
        organizationId,
        name: dto.name,
        nif: dto.nif ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        priceListId: dto.priceListId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const { organizationId } = requireTenant();
    if (dto.priceListId) await this.assertPriceListInOrg(dto.priceListId, organizationId);
    await this.prisma.customer.updateMany({
      where: { id, organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nif !== undefined ? { nif: dto.nif } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.priceListId !== undefined ? { priceListId: dto.priceListId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: { priceList: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string): Promise<void> {
    const { organizationId } = requireTenant();
    await this.prisma.customer.deleteMany({ where: { id, organizationId } });
  }
}
