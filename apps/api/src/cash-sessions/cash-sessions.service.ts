import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { round2 } from '../common/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
} from './cash-sessions.dto.js';

/**
 * Efectivo esperado en el cajón al cerrar: inicial + ventas en efectivo + neto de
 * movimientos manuales − reembolsos en efectivo del turno (SEC-11). Función pura
 * para poder probar el cuadre sin tocar la DB.
 */
export function computeExpected(
  opening: number,
  cashSales: number,
  movementNet = 0,
  cashRefunds = 0,
): number {
  return round2(opening + cashSales + movementNet - cashRefunds);
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
  async open(dto: OpenCashSessionDto, userId: string, role: string) {
    const tenant = requireTenant();

    // Aislamiento por tienda (SEC-01): un CLERK solo abre caja en sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId: dto.storeId });

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
  async close(id: string, dto: CloseCashSessionDto, userId: string, role: string) {
    const tenant = requireTenant();

    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    // Aislamiento por tienda (SEC-01): un CLERK solo cierra cajas de sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId: session.storeId });
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

    const movementAgg = await this.prisma.cashMovement.groupBy({
      by: ['type'],
      where: {
        organizationId: tenant.organizationId,
        cashSessionId: session.id,
      },
      _sum: { amount: true },
    });
    const movementNet = movementAgg.reduce((acc, row) => {
      const amount = Number(row._sum.amount ?? 0);
      return acc + (row.type === 'IN' ? amount : -amount);
    }, 0);

    // Reembolsos en efectivo del turno (SEC-11): salen del cajón y deben restarse
    // del esperado. Heurística (sin nuevo campo en el modelo): se considera que un
    // reembolso es en efectivo si la venta original se pagó en efectivo, y las
    // devoluciones SIN ticket (saleId null) se asumen en efectivo. Misma tienda y
    // ventana del turno que las ventas. Si el negocio reembolsa ventas con tarjeta
    // en efectivo (u otro criterio), conviene modelar el método de pago del Return.
    const refundAgg = await this.prisma.return.aggregate({
      _sum: { total: true },
      where: {
        organizationId: tenant.organizationId,
        storeId: session.storeId,
        createdAt: { gte: session.openedAt },
        OR: [{ saleId: null }, { sale: { paymentMethod: 'CASH' } }],
      },
    });
    const cashRefunds = Number(refundAgg._sum.total ?? 0);

    const expected = computeExpected(
      Number(session.openingAmount),
      cashSales,
      movementNet,
      cashRefunds,
    );
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
  async current(storeId: string, userId: string, role: string) {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo consulta cajas de sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId });
    return this.prisma.cashSession.findFirst({
      where: { storeId, organizationId: tenant.organizationId, status: 'OPEN' },
    });
  }

  async movements(id: string, userId: string, role: string) {
    const tenant = requireTenant();
    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true, storeId: true },
    });
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    // Aislamiento por tienda (SEC-01): un CLERK solo ve movimientos de sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId: session.storeId });
    return this.prisma.cashMovement.findMany({
      where: { cashSessionId: id, organizationId: tenant.organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMovement(id: string, dto: CreateCashMovementDto, userId: string) {
    const tenant = requireTenant();
    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
    }
    if (session.status !== 'OPEN') {
      throw new BadRequestException('La caja ya está cerrada');
    }
    return this.prisma.cashMovement.create({
      data: {
        organizationId: tenant.organizationId,
        cashSessionId: id,
        storeId: session.storeId,
        userId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason.trim(),
      },
    });
  }
}
