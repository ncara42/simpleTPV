import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type { CreateReturnDto } from './returns.dto.js';

// Redondeo a 2 decimales (céntimos), idéntico al de ventas, para que el cálculo
// coincida con la columna DECIMAL(12,2).
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Importe a devolver por una línea: la parte proporcional del neto de la
 * SaleLine. unitario neto = saleLineTotal / saleLineQty (precio ya con
 * descuentos de línea/ticket congelados). Función pura, testeable.
 */
export function computeReturnLineTotal(
  saleLineTotal: number,
  saleLineQty: number,
  qty: number,
): number {
  if (saleLineQty <= 0) {
    return 0;
  }
  return round2((saleLineTotal / saleLineQty) * qty);
}

/**
 * Cantidad disponible para devolver de una SaleLine: lo vendido menos lo ya
 * devuelto en devoluciones anteriores. Nunca negativa. Función pura, testeable.
 */
export function computeReturnable(saleLineQty: number, alreadyReturned: number): number {
  return round2(Math.max(0, saleLineQty - alreadyReturned));
}

@Injectable()
export class ReturnsService {
  constructor(
    // Extendido: lecturas con RLS por-operación.
    private readonly prisma: PrismaService,
    // Base: para withTenantTx (una sola transacción atómica).
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
  ) {}

  /**
   * Crea una devolución parcial contra un ticket de venta. Todo dentro de
   * withTenantTx (cliente base) para que la validación y el create compartan UNA
   * transacción atómica con el tenant fijado (RLS aplicada).
   */
  async create(dto: CreateReturnDto, userId: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      // 1. Carga la venta del tenant con sus líneas. Defensa en profundidad:
      //    además de RLS, filtramos por organizationId explícito.
      const sale = await tx.sale.findFirst({
        where: { id: dto.saleId, organizationId: tenant.organizationId },
        include: { lines: true },
      });
      if (!sale) {
        throw new NotFoundException(`Venta ${dto.saleId} no encontrada`);
      }
      if (sale.status === 'VOIDED') {
        throw new BadRequestException('No se puede devolver una venta anulada');
      }

      const linesById = new Map(sale.lines.map((l) => [l.id, l]));

      // 2. Devoluciones previas de esta venta: sumamos lo ya devuelto por saleLine.
      const previous = await tx.returnLine.findMany({
        where: { saleLineId: { in: sale.lines.map((l) => l.id) } },
        select: { saleLineId: true, qty: true },
      });
      const returnedBySaleLine = new Map<string, number>();
      for (const rl of previous) {
        returnedBySaleLine.set(
          rl.saleLineId,
          (returnedBySaleLine.get(rl.saleLineId) ?? 0) + Number(rl.qty),
        );
      }

      // 3. Valida cada línea del dto y calcula su importe.
      const returnLines = dto.lines.map((l) => {
        const saleLine = linesById.get(l.saleLineId);
        if (!saleLine) {
          throw new BadRequestException(`La línea ${l.saleLineId} no pertenece a la venta`);
        }
        const saleLineQty = Number(saleLine.qty);
        const alreadyReturned = returnedBySaleLine.get(l.saleLineId) ?? 0;
        const available = computeReturnable(saleLineQty, alreadyReturned);
        if (l.qty > available) {
          throw new BadRequestException(
            `No se puede devolver más de lo vendido en la línea ${l.saleLineId} (disponible: ${available})`,
          );
        }
        const lineTotal = computeReturnLineTotal(Number(saleLine.lineTotal), saleLineQty, l.qty);
        return {
          organizationId: tenant.organizationId,
          saleLineId: l.saleLineId,
          productId: saleLine.productId,
          qty: l.qty,
          lineTotal,
        };
      });

      // 4. total = Σ lineTotal.
      const total = round2(returnLines.reduce((acc, l) => acc + l.lineTotal, 0));

      // TODO: stock semana 3 — restaurar el stock de las líneas devueltas (no-op por ahora).

      // 5. Crea el Return + sus ReturnLines (nested create), con organizationId
      //    en ambos. storeId/userId se toman de la venta y del usuario actual.
      return tx.return.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: sale.storeId,
          userId,
          saleId: sale.id,
          reason: dto.reason,
          total,
          lines: { create: returnLines },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Devoluciones de una venta del tenant (para que el TPV muestre lo ya
   * devuelto). RLS + filtro por organizationId explícito.
   */
  async list(saleId: string) {
    const tenant = requireTenant();
    return this.prisma.return.findMany({
      where: { saleId, organizationId: tenant.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
    });
  }
}
