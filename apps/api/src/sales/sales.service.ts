import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateSaleDto } from './sales.dto.js';

interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export function formatTicket(code: string, counter: number): string {
  return `T${code}-${String(counter).padStart(6, '0')}`;
}

export function computeTotals(lines: PricedLine[]): {
  lines: Array<PricedLine & { lineTotal: number }>;
  subtotal: number;
  total: number;
} {
  const priced = lines.map((l) => ({ ...l, lineTotal: l.unitPrice * l.qty }));
  const subtotal = priced.reduce((acc, l) => acc + l.lineTotal, 0);
  return { lines: priced, subtotal, total: subtotal };
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleDto, userId: string) {
    const tenant = requireTenant();

    // El cliente extendido ya aplica RLS por-operación: esta lectura solo ve
    // productos del tenant. Si falta alguno → error (no se mezcla con otro tenant).
    const ids = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const priced: PricedLine[] = dto.lines.map((l) => {
      const product = byId.get(l.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${l.productId} no encontrado`);
      }
      return {
        productId: l.productId,
        name: product.name,
        unitPrice: Number(product.salePrice),
        qty: l.qty,
      };
    });

    const { lines, subtotal, total } = computeTotals(priced);

    // El cliente inyectado es el extendido; necesitamos el base para abrir UNA
    // transacción que incluya el incremento del contador + la creación. Como el
    // extendido envuelve cada operación en su propia tx, usamos el método
    // $transaction del propio cliente: withTenantTx fija el tenant con set_config
    // LOCAL y todo corre en esa única tx.
    return withTenantTx(this.prisma, tenant.organizationId, async (tx) => {
      const updated = await tx.$queryRaw<Array<{ code: string; ticketCounter: number }>>`
        UPDATE "Store" SET "ticketCounter" = "ticketCounter" + 1
        WHERE id = ${dto.storeId}::uuid
        RETURNING code, "ticketCounter"
      `;
      const store = updated[0];
      if (!store) {
        throw new NotFoundException(`Tienda ${dto.storeId} no encontrada`);
      }
      const ticketNumber = formatTicket(store.code, store.ticketCounter);

      // TODO: stock semana 3 — decrementar stock atómicamente aquí (no-op por ahora).

      return tx.sale.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: dto.storeId,
          userId,
          ticketNumber,
          subtotal,
          total,
          lines: {
            create: lines.map((l) => ({
              organizationId: tenant.organizationId,
              productId: l.productId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }
}
