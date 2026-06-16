import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { round2 } from '../common/money.js';
import { EVENT_BUS, type EventBus } from '../events/event-bus.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { TxClient } from '../prisma/with-tenant-tx.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import type {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
  RequestCashMovementDto,
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /**
   * Resuelve la tienda central de la organización (destino obligatorio de los
   * traspasos, #146 D-3). Lanza 400 si no hay central configurada o si el origen
   * ES la propia central (no tiene sentido traspasarse a sí misma).
   */
  private async resolveCentralStoreId(
    tx: TxClient,
    organizationId: string,
    sourceStoreId: string,
  ): Promise<string> {
    const central = await tx.store.findFirst({
      where: { organizationId, isCentral: true },
      select: { id: true },
    });
    if (!central) {
      throw new BadRequestException(
        'No hay una tienda central configurada para los traspasos',
      );
    }
    if (central.id === sourceStoreId) {
      throw new BadRequestException(
        'La tienda central no puede traspasar efectivo a sí misma',
      );
    }
    return central.id;
  }

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
   * openedAt) y compara con lo contado.
   *
   * TOCTOU (RACE-02): el cierre y `createMovement` deben SERIALIZARSE sobre la
   * misma fila de la sesión. Sin ello el lock de `createMovement` es unilateral y
   * no contiende con nada: un `createMovement` concurrente podría colarse entre el
   * cálculo del `expectedAmount` (que agrega los CashMovement) y el commit del
   * cierre → el cierre no incluiría ese movimiento y se corrompería el cuadre. Por
   * eso el cierre adquiere `SELECT ... FOR UPDATE` sobre la fila ANTES de agregar
   * movimientos/ventas y hace el update dentro de la MISMA transacción (cliente
   * BASE vía `withTenantTx`, con RLS fijada). Resultado: o el movimiento entra
   * antes (y el cierre lo cuenta en `expectedAmount`) o el cierre gana (y
   * `createMovement`, al re-leer tras el lock, ve `status = 'CLOSED'` → 400). La
   * transición sigue siendo atómica vía updateMany condicional (status=OPEN), que
   * además protege contra doble cierre.
   */
  async close(id: string, dto: CloseCashSessionDto, userId: string, role: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      // Lock pesimista de la fila de la sesión ANTES de leer su estado y de
      // agregar los movimientos/ventas. Serializa un `createMovement` concurrente:
      // el segundo actor espera al commit del primero. Si la sesión no existe no
      // bloquea ninguna fila y el findFirst posterior lanza 404. RLS ya restringe
      // al tenant; el filtro por organizationId es defensa en profundidad.
      await tx.$executeRaw`SELECT id FROM "CashSession" WHERE id = ${id}::uuid FOR UPDATE`;

      const session = await tx.cashSession.findFirst({
        where: { id, organizationId: tenant.organizationId },
      });
      if (!session) {
        throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
      }
      // Aislamiento por tienda (SEC-01): un CLERK solo cierra cajas de sus tiendas.
      await assertStoreAccess(tx, { userId, role, storeId: session.storeId });
      if (session.status === 'CLOSED') {
        throw new BadRequestException('La caja ya está cerrada');
      }

      // Auto-denegación de solicitudes pendientes al cerrar (#146 D-6): un PENDING
      // no puede aprobarse contra una sesión ya cerrada. Dentro del lock pesimista,
      // así un request/approve concurrente espera al commit y re-lee la sesión
      // CLOSED → 400 (no quedan PENDING colgando de una caja cerrada).
      await tx.cashMovement.updateMany({
        where: {
          organizationId: tenant.organizationId,
          cashSessionId: session.id,
          status: 'PENDING',
        },
        data: { status: 'DENIED', reviewedById: userId, reviewedAt: new Date() },
      });

      // Ventas en efectivo del turno: misma tienda, COMPLETED, CASH, desde la
      // apertura. Las VOIDED no cuentan (status COMPLETED). CARD tampoco.
      const agg = await tx.sale.aggregate({
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

      // Agregación de movimientos DENTRO de la tx y DESPUÉS del FOR UPDATE: así
      // refleja cualquier movimiento que entrara antes de adquirir el lock, y un
      // `createMovement` que llegue después esperará a este commit y re-leerá la
      // sesión ya CLOSED → 400. Es la pieza clave del cierre del TOCTOU.
      // Solo los movimientos APPROVED afectan al cuadre (#146 D-6): un PENDING no
      // cuenta hasta aprobarse, y los recién auto-denegados arriba quedan fuera.
      const movementAgg = await tx.cashMovement.groupBy({
        by: ['type'],
        where: {
          organizationId: tenant.organizationId,
          cashSessionId: session.id,
          status: 'APPROVED',
        },
        _sum: { amount: true },
      });
      // IN suma; OUT y TRANSFER_OUT (traspaso a central) salen del cajón → restan.
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
      const refundAgg = await tx.return.aggregate({
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
      // filas). organizationId refuerza el aislamiento del write. Dentro de la
      // misma tx que el FOR UPDATE y los agregados → cuadre consistente.
      const updated = await tx.cashSession.updateMany({
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

      // La sesión existe y la acabamos de cerrar en esta misma tx → no es null.
      return tx.cashSession.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
      });
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

  /**
   * Registro de cierres de caja de una tienda (#145): las sesiones CLOSED con su
   * cuadre (apertura, cierre, esperado y diferencia), de la más reciente a la más
   * antigua. Acotado por tienda (SEC-01): un CLERK solo ve los cierres de sus
   * tiendas. `limit` viene ya saneado del DTO (1..100, por defecto 30).
   */
  async listClosed(storeId: string, userId: string, role: string, limit = 30) {
    const tenant = requireTenant();
    await assertStoreAccess(this.prisma, { userId, role, storeId });
    return this.prisma.cashSession.findMany({
      where: { storeId, organizationId: tenant.organizationId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: limit,
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

  /**
   * Alta DIRECTA de movimiento (legacy ADMIN/MANAGER, #146 P-1): el aprobador que
   * actúa en su propia tienda no necesita el doble paso, así que el movimiento
   * nace ya APPROVED (requestedBy = reviewedBy = el propio actor). Se mantiene por
   * compatibilidad junto al flujo request→approve.
   *
   * TOCTOU (RACE-02): la lectura del estado y el create comparten UNA transacción
   * con lock pesimista sobre la fila de la sesión. Sin él, un `close` concurrente
   * que se cuele entre la comprobación de `status` y el `create` permitiría
   * insertar un movimiento (ya APPROVED) en una sesión cuyo `expectedAmount` no lo
   * reflejaría → cuadre corrupto. Con `SELECT ... FOR UPDATE` la creación espera al
   * commit del cierre y, al releer, ve `status = 'CLOSED'` → 400.
   */
  async createMovement(id: string, dto: CreateCashMovementDto, userId: string, role: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      await tx.$executeRaw`SELECT id FROM "CashSession" WHERE id = ${id}::uuid FOR UPDATE`;

      const session = await tx.cashSession.findFirst({
        where: { id, organizationId: tenant.organizationId },
      });
      if (!session) {
        throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
      }
      // Aislamiento por tienda (SEC-01): acota al CLERK; ADMIN/MANAGER org-wide.
      await assertStoreAccess(tx, { userId, role, storeId: session.storeId });
      if (session.status !== 'OPEN') {
        throw new BadRequestException('La caja ya está cerrada');
      }
      const targetStoreId =
        dto.type === 'TRANSFER_OUT'
          ? await this.resolveCentralStoreId(tx, tenant.organizationId, session.storeId)
          : undefined;
      return tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          cashSessionId: id,
          storeId: session.storeId,
          userId,
          type: dto.type,
          amount: dto.amount,
          reason: dto.reason.trim(),
          status: 'APPROVED',
          requestedById: userId,
          reviewedById: userId,
          reviewedAt: new Date(),
          ...(targetStoreId ? { targetStoreId } : {}),
        },
      });
    });
  }

  /**
   * SOLICITA un movimiento de efectivo desde el TPV (#146): cualquier rol operativo
   * (incluido CLERK) lo crea PENDING; un ADMIN/MANAGER lo aprobará o denegará luego.
   * Para TRANSFER_OUT fija `targetStoreId` = tienda central de la organización.
   *
   * Mismo lock pesimista que `createMovement`: si la caja se cierra en paralelo, la
   * solicitud espera al commit y re-lee CLOSED → 400 (no quedan PENDING colgando de
   * una caja cerrada). Tras commit emite `cash.movement.requested` para la campana.
   */
  async requestMovement(id: string, dto: RequestCashMovementDto, userId: string, role: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      await tx.$executeRaw`SELECT id FROM "CashSession" WHERE id = ${id}::uuid FOR UPDATE`;

      const session = await tx.cashSession.findFirst({
        where: { id, organizationId: tenant.organizationId },
      });
      if (!session) {
        throw new NotFoundException(`Sesión de caja ${id} no encontrada`);
      }
      // Aislamiento por tienda (SEC-01): un CLERK solo solicita en sus tiendas.
      await assertStoreAccess(tx, { userId, role, storeId: session.storeId });
      if (session.status !== 'OPEN') {
        throw new BadRequestException('La caja ya está cerrada');
      }
      const targetStoreId =
        dto.type === 'TRANSFER_OUT'
          ? await this.resolveCentralStoreId(tx, tenant.organizationId, session.storeId)
          : undefined;
      const movement = await tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          cashSessionId: id,
          storeId: session.storeId,
          userId,
          type: dto.type,
          amount: dto.amount,
          reason: dto.reason.trim(),
          status: 'PENDING',
          requestedById: userId,
          ...(targetStoreId ? { targetStoreId } : {}),
        },
      });
      // Refresco en vivo de la campana de aprobaciones (#146 D-7/P-3). Best-effort:
      // si el bus falla no revierte la solicitud (ya confirmada).
      afterCommit(async () => {
        await this.events.publish(tenant.organizationId, {
          type: 'cash.movement.requested',
          data: {
            movementId: movement.id,
            storeId: movement.storeId,
            type: movement.type,
            amount: movement.amount.toString(),
          },
        });
      });
      return movement;
    });
  }

  /**
   * Solicitudes PENDING de la organización (#146 D-7): fuente de la campana del
   * backoffice. Org-wide para ADMIN/MANAGER (RLS aísla por tenant). De la más
   * reciente a la más antigua.
   */
  async listPendingMovements() {
    const tenant = requireTenant();
    // Enriquecemos con el nombre de la tienda y del solicitante para que la campana
    // del backoffice los muestre sin un lookup extra (D-7).
    return this.prisma.cashMovement.findMany({
      where: { organizationId: tenant.organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        store: { select: { name: true } },
        requestedBy: { select: { name: true } },
      },
    });
  }

  /**
   * APRUEBA una solicitud (PENDING → APPROVED, #146). Solo ADMIN/MANAGER. Bajo el
   * lock de la sesión (serializa con el cierre): aprobar tras el cálculo del
   * `expectedAmount` corrompería el cuadre, así que exige sesión OPEN dentro del
   * lock. La transición es atómica (updateMany condicional status=PENDING) para
   * que dos aprobadores concurrentes no la dupliquen.
   */
  async approveMovement(movId: string, userId: string, role: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      const movement = await tx.cashMovement.findFirst({
        where: { id: movId, organizationId: tenant.organizationId },
      });
      if (!movement) {
        throw new NotFoundException(`Movimiento ${movId} no encontrado`);
      }
      // Aislamiento por tienda (SEC-01): acota al CLERK; ADMIN/MANAGER org-wide.
      await assertStoreAccess(tx, { userId, role, storeId: movement.storeId });

      // Lock de la sesión: serializa con un cierre concurrente.
      await tx.$executeRaw`SELECT id FROM "CashSession" WHERE id = ${movement.cashSessionId}::uuid FOR UPDATE`;
      const session = await tx.cashSession.findFirst({
        where: { id: movement.cashSessionId, organizationId: tenant.organizationId },
        select: { status: true },
      });
      if (!session || session.status !== 'OPEN') {
        throw new BadRequestException('La caja ya está cerrada');
      }

      const updated = await tx.cashMovement.updateMany({
        where: { id: movId, organizationId: tenant.organizationId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: userId, reviewedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new BadRequestException('El movimiento ya no está pendiente');
      }
      return tx.cashMovement.findFirstOrThrow({
        where: { id: movId, organizationId: tenant.organizationId },
      });
    });
  }

  /**
   * DENIEGA una solicitud (PENDING → DENIED, #146). Solo ADMIN/MANAGER. No toca el
   * cuadre (un DENIED nunca cuenta), así que no requiere sesión OPEN ni lock de
   * cierre; la transición es atómica vía updateMany condicional.
   */
  async denyMovement(movId: string, userId: string, role: string) {
    const tenant = requireTenant();
    const movement = await this.prisma.cashMovement.findFirst({
      where: { id: movId, organizationId: tenant.organizationId },
      select: { id: true, storeId: true },
    });
    if (!movement) {
      throw new NotFoundException(`Movimiento ${movId} no encontrado`);
    }
    // Aislamiento por tienda (SEC-01): acota al CLERK; ADMIN/MANAGER org-wide.
    await assertStoreAccess(this.prisma, { userId, role, storeId: movement.storeId });

    const updated = await this.prisma.cashMovement.updateMany({
      where: { id: movId, organizationId: tenant.organizationId, status: 'PENDING' },
      data: { status: 'DENIED', reviewedById: userId, reviewedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new BadRequestException('El movimiento ya no está pendiente');
    }
    return this.prisma.cashMovement.findFirstOrThrow({
      where: { id: movId, organizationId: tenant.organizationId },
    });
  }
}
