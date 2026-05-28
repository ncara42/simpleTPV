import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CloseCashSessionDto, OpenCashSessionDto } from './cash-sessions.dto.js';

// Redondeo a 2 decimales (céntimos): el cuadre debe coincidir con la columna
// DECIMAL(12,2) y con lo que el TPV muestra. Sin esto, sumar floats puede
// arrastrar imprecisión y divergir del importe esperado.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Efectivo esperado en el cajón al cerrar: inicial + ventas en efectivo del
 * turno. Función pura para poder probar el cuadre sin tocar la DB.
 */
export function computeExpected(opening: number, cashSales: number): number {
  return round2(opening + cashSales);
}

/**
 * Diferencia del cuadre: contado − esperado. Positivo = sobrante, negativo =
 * faltante, cero = cuadre exacto.
 */
export function computeDifference(counted: number, expected: number): number {
  return round2(counted - expected);
}

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre una caja para una tienda del tenant. Solo puede haber una sesión OPEN
   * por tienda a la vez (validado aquí, no por constraint, para mantenerlo
   * simple). El cliente extendido aplica RLS por-operación.
   */
  async open(dto: OpenCashSessionDto, userId: string) {
    const tenant = requireTenant();

    // Defensa en profundidad: además de RLS filtramos por organizationId.
    const existing = await this.prisma.cashSession.findFirst({
      where: { storeId: dto.storeId, organizationId: tenant.organizationId, status: 'OPEN' },
    });
    if (existing) {
      throw new BadRequestException('Ya hay una caja abierta en esta tienda');
    }

    return this.prisma.cashSession.create({
      data: {
        organizationId: tenant.organizationId,
        storeId: dto.storeId,
        userId,
        openingAmount: dto.openingAmount,
        status: 'OPEN',
      },
    });
  }

  /**
   * Cierra una caja del tenant calculando el cuadre. Suma las ventas en efectivo
   * (COMPLETED, CASH) de la misma tienda en la ventana del turno (createdAt >=
   * openedAt) y compara con lo contado. La transición a CLOSED es atómica:
   * updateMany condicional (status=OPEN) evita doble cierre concurrente.
   */
  async close(id: string, dto: CloseCashSessionDto) {
    const tenant = requireTenant();

    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    if (session.status === 'CLOSED') {
      throw new BadRequestException('La caja ya está cerrada');
    }

    // Ventas en efectivo del turno: misma tienda, COMPLETED, CASH, desde la
    // apertura. Las VOIDED no cuentan (status COMPLETED). CARD tampoco.
    const agg = await this.prisma.sale.aggregate({
      _sum: { total: true },
      where: {
        organizationId: tenant.organizationId,
        storeId: session.storeId,
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        createdAt: { gte: session.openedAt },
      },
    });
    const cashSales = Number(agg._sum.total ?? 0);

    const expected = computeExpected(Number(session.openingAmount), cashSales);
    const difference = computeDifference(dto.countedAmount, expected);

    // Transición atómica: la condición status=OPEN viaja al WHERE, así dos
    // cierres concurrentes no pueden ambos tener éxito (el segundo afecta 0
    // filas). organizationId refuerza el aislamiento del write.
    const updated = await this.prisma.cashSession.updateMany({
      where: { id, organizationId: tenant.organizationId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        closingAmount: dto.countedAmount,
        expectedAmount: expected,
        difference,
        closedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      // Otra request la cerró entre la lectura y el update.
      throw new BadRequestException('La caja ya está cerrada');
    }

    // La sesión existe y la acabamos de cerrar en esta misma request → no es null.
    return this.prisma.cashSession.findFirstOrThrow({
      where: { id, organizationId: tenant.organizationId },
    });
  }

  /**
   * Devuelve la sesión OPEN de una tienda del tenant, o null si no hay ninguna
   * abierta. Lo usa el TPV para saber el estado de la caja.
   */
  async current(storeId: string) {
    const tenant = requireTenant();
    return this.prisma.cashSession.findFirst({
      where: { storeId, organizationId: tenant.organizationId, status: 'OPEN' },
    });
  }
}
