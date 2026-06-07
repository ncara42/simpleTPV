import { BadRequestException, Injectable } from '@nestjs/common';

import { requireFound, requireOwned } from '../common/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateWholesaleOrderDto, ListWholesaleOrdersQueryDto } from './b2b.dto.js';

const PAGE_SIZE = 20;
const VALID_STATUS = ['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'] as const;
type Status = (typeof VALID_STATUS)[number];
const round2 = (n: number): number => Math.round(n * 100) / 100;

// Pedidos mayoristas salientes (IT-17c). El precio de cada línea se congela desde la
// tarifa del cliente (PriceListItem) o, si no hay, desde el PVP del producto. RLS por
// tenant; se verifica que cliente y productos sean del propio tenant.
@Injectable()
export class WholesaleOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWholesaleOrderDto) {
    const { organizationId } = requireTenant();
    const customer = await requireOwned(
      this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
        select: { id: true, priceListId: true },
      }),
      'Cliente no encontrado.',
    );

    const productIds = [...new Set(dto.lines.map((l) => l.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId, active: true },
      select: { id: true, salePrice: true },
    });
    const saleById = new Map(products.map((p) => [p.id, Number(p.salePrice)]));

    // Precio mayorista desde la tarifa del cliente (si la tiene); fallback al PVP.
    const tariffById = new Map<string, number>();
    if (customer.priceListId) {
      const items = await this.prisma.priceListItem.findMany({
        where: { priceListId: customer.priceListId, productId: { in: productIds }, organizationId },
        select: { productId: true, price: true },
      });
      for (const it of items) tariffById.set(it.productId, Number(it.price));
    }

    const lines = dto.lines.map((l) => {
      const sale = saleById.get(l.productId);
      if (sale === undefined) throw new BadRequestException('Producto no encontrado o inactivo.');
      const unitPrice = tariffById.get(l.productId) ?? sale;
      return {
        organizationId,
        productId: l.productId,
        qty: l.qty,
        unitPrice,
        lineTotal: round2(unitPrice * l.qty),
      };
    });
    const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

    return this.prisma.wholesaleOrder.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        status: 'DRAFT',
        total,
        notes: dto.notes ?? null,
        lines: { create: lines },
      },
      include: { lines: true, customer: { select: { name: true } } },
    });
  }

  async list(q: ListWholesaleOrdersQueryDto) {
    const { organizationId } = requireTenant();
    const page = q.page && q.page > 0 ? q.page : 1;
    const where = {
      organizationId,
      ...(q.status && VALID_STATUS.includes(q.status as Status)
        ? { status: q.status as Status }
        : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.wholesaleOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { customer: { select: { name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.wholesaleOrder.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        customerId: o.customerId,
        customerName: o.customer.name,
        status: o.status,
        total: o.total,
        lineCount: o._count.lines,
        createdAt: o.createdAt,
      })),
      page,
      pageSize: PAGE_SIZE,
      totalItems,
    };
  }

  async get(id: string) {
    const { organizationId } = requireTenant();
    return this.prisma.wholesaleOrder.findFirst({
      where: { id, organizationId },
      include: {
        customer: { select: { name: true, nif: true } },
        lines: { include: { product: { select: { name: true } } } },
      },
    });
  }

  // Transición de estado. DRAFT→CONFIRMED→SHIPPED, o CANCELLED desde DRAFT/CONFIRMED.
  // Una vez SHIPPED o CANCELLED el pedido está cerrado.
  async updateStatus(id: string, status: string) {
    const { organizationId } = requireTenant();
    if (!VALID_STATUS.includes(status as Status)) {
      throw new BadRequestException('Estado no válido.');
    }
    const order = await requireFound(
      this.prisma.wholesaleOrder.findFirst({
        where: { id, organizationId },
        select: { status: true },
      }),
      'Pedido no encontrado.',
    );
    if (order.status === 'SHIPPED' || order.status === 'CANCELLED') {
      throw new BadRequestException('El pedido ya está cerrado y no admite cambios de estado.');
    }
    await this.prisma.wholesaleOrder.updateMany({
      where: { id, organizationId },
      data: { status: status as Status },
    });
    return this.prisma.wholesaleOrder.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
  }
}
