import { Injectable, NotFoundException } from '@nestjs/common';
import type { Promotion } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto.js';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePromotionDto): Promise<Promotion> {
    // RLS filtra lectura/escritura por la policy, pero el INSERT necesita el
    // organizationId explícito (del contexto de tenant del JWT).
    const tenant = requireTenant();
    return this.prisma.promotion.create({
      data: {
        organizationId: tenant.organizationId,
        name: input.name,
        conditionType: input.conditionType,
        threshold: input.threshold,
        discountType: input.discountType,
        discountValue: input.discountValue,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        active: input.active ?? true,
      },
    });
  }

  // Catálogo de promociones de la org (RLS acota al tenant). El estado efectivo
  // (activa/programada/expirada/pausada) lo deriva el cliente con las fechas + active.
  findAll(): Promise<Promotion[]> {
    return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findFirst({ where: { id } });
    if (!promotion) {
      throw new NotFoundException(`Promoción ${id} no encontrada`);
    }
    return promotion;
  }

  async update(id: string, input: UpdatePromotionDto): Promise<Promotion> {
    await this.findOne(id);
    return this.prisma.promotion.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.conditionType !== undefined ? { conditionType: input.conditionType } : {}),
        ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
        ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
        ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
        ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.promotion.delete({ where: { id } });
  }
}
