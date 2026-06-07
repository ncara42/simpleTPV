import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { type ApiKeyContext, ApiKeyGuard } from '../api-keys/api-key.guard.js';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';

class PublicStockQueryDto {
  storeId?: string;
}

// API pública de stock (IT-18). Requiere X-API-Key; sin JWT.
// Expone cantidad + precio mayorista (de la tarifa del key). Sin márgenes ni costes.
// Rate limit estricto: 30 req/min/IP (vs 120 del API privado).
@Public()
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stock')
  async stock(@Req() req: { apiKey?: ApiKeyContext }, @Query() query: PublicStockQueryDto) {
    const { organizationId } = requireTenant();
    const priceListId = req.apiKey?.priceListId ?? null;

    const stocks = await this.prisma.stock.findMany({
      where: {
        organizationId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        product: { active: true },
      },
      select: {
        storeId: true,
        quantity: true,
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { storeId: 'asc' }],
    });

    const priceByProduct = new Map<string, number>();
    if (priceListId) {
      const items = await this.prisma.priceListItem.findMany({
        where: { priceListId, organizationId },
        select: { productId: true, price: true },
      });
      for (const it of items) priceByProduct.set(it.productId, Number(it.price));
    }

    return stocks.map((s) => ({
      productId: s.product.id,
      sku: s.product.sku,
      name: s.product.name,
      storeId: s.storeId,
      quantity: Number(s.quantity),
      wholesalePrice: priceByProduct.get(s.product.id) ?? null,
    }));
  }
}
