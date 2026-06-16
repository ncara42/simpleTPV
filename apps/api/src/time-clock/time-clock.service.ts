import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { TimeClockType } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import {
  computeWorked,
  deriveStatus,
  endOfLocalDay,
  localDayKey,
  nextStateOrThrow,
  startOfLocalDay,
  statusFromLastType,
  totalWorkedMs,
} from './time-clock.compute.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Cota máxima del rango consultable en el historial (DOS-02/DOS-04): sin tope, un
// cliente autenticado puede pedir años de fichajes y degradar la BD. 90 días cubre
// holgadamente las necesidades de gestión (revisión trimestral) de un SMB.
const MAX_RANGE_DAYS = 90;

@Injectable()
export class TimeClockService {
  constructor(
    private readonly prisma: PrismaService,
    // Base: para withTenantTx (lectura+validación+inserción atómicas con lock).
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    // Feature flags (#127 B): gatea el fichaje por org/tienda. @Optional para no
    // romper construcciones directas en tests; en producción DI lo provee.
    @Optional() private readonly features?: FeatureFlagService,
  ) {}

  async current(storeId: string, userId: string) {
    const tenant = requireTenant();
    return this.prisma.timeClockEntry.findFirst({
      where: { organizationId: tenant.organizationId, storeId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    input: { storeId: string; deviceId?: string; type: TimeClockType },
    userId: string,
    role: string,
  ) {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo ficha en sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId: input.storeId });
    // Feature flag (#127 B): el control horario puede estar apagado en esta tienda
    // u org → 403. Sin flag → comportamiento actual (activo).
    await this.features?.assertEnabled('time_clock', input.storeId);

    // S-12: la lectura del último fichaje, la validación de secuencia y la
    // inserción deben ser atómicas y serializadas por (usuario, tienda). Sin
    // esto, dos peticiones concurrentes leen el mismo "último fichaje", ambas
    // pasan nextStateOrThrow y crean entradas duplicadas (TimeClockEntry no tiene
    // restricción UNIQUE que lo impida), corrompiendo la máquina de estados y las
    // horas trabajadas. El advisory lock por (userId, storeId) hace que la
    // segunda transacción espere al commit de la primera y reevalúe la secuencia.
    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId} || ':' || ${input.storeId}, 0))`;

      // Validación de secuencia: el estado actual lo determina el último fichaje;
      // nextStateOrThrow lanza 409 si la transición es inválida (p.ej. doble entrada).
      const last = await tx.timeClockEntry.findFirst({
        where: { organizationId: tenant.organizationId, storeId: input.storeId, userId },
        orderBy: { createdAt: 'desc' },
      });
      nextStateOrThrow(statusFromLastType(last?.type), input.type);

      if (!input.deviceId) {
        throw new ForbiddenException('Este TPV no está autorizado como dispositivo oficial');
      }
      const device = await tx.officialDevice.findFirst({
        where: {
          id: input.deviceId,
          storeId: input.storeId,
          organizationId: tenant.organizationId,
          authorized: true,
        },
      });
      if (!device) {
        throw new NotFoundException('Dispositivo oficial no autorizado para esta tienda');
      }
      return tx.timeClockEntry.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: input.storeId,
          userId,
          deviceId: input.deviceId,
          type: input.type,
        },
      });
    });
  }

  /** Resumen de la jornada de HOY del usuario: estado, horas y lista de fichajes. */
  async today(storeId: string, userId: string) {
    const tenant = requireTenant();
    const now = new Date();
    const entries = await this.prisma.timeClockEntry.findMany({
      where: {
        organizationId: tenant.organizationId,
        storeId,
        userId,
        createdAt: { gte: startOfLocalDay(now) },
      },
      orderBy: { createdAt: 'asc' },
    });
    const totals = computeWorked(entries, now);
    return {
      status: deriveStatus(entries),
      workedMs: totals.workedMs,
      breakMs: totals.breakMs,
      runningSince: totals.runningSince,
      entries,
    };
  }

  /**
   * Resuelve el rango [from, to] de una consulta de historial aplicando una cota
   * máxima (DOS-02/DOS-04). `to` por defecto es hoy; `from` por defecto retrocede
   * `defaultDays`. Si el rango pedido supera MAX_RANGE_DAYS se recorta `from` para
   * que como mucho abarque esa ventana terminando en `to`, evitando consultas sin
   * cota que crecen con el tiempo.
   */
  private resolveRange(
    params: { from?: string; to?: string },
    defaultDays: number,
    now: Date,
  ): { from: Date; to: Date } {
    const to = params.to ? endOfLocalDay(new Date(params.to)) : endOfLocalDay(now);
    const requestedFrom = params.from
      ? startOfLocalDay(new Date(params.from))
      : startOfLocalDay(new Date(now.getTime() - defaultDays * MS_PER_DAY));
    const minFrom = startOfLocalDay(new Date(to.getTime() - MAX_RANGE_DAYS * MS_PER_DAY));
    // Recorta solo si el rango pedido excede la ventana máxima (from por debajo del
    // mínimo permitido). Nunca empuja `from` hacia el futuro respecto a lo pedido.
    const from = requestedFrom.getTime() < minFrom.getTime() ? minFrom : requestedFrom;
    return { from, to };
  }

  /**
   * Historial de control horario por empleado y día para gestión (backoffice).
   * Agrupa los fichajes por usuario+jornada y calcula totales de horas.
   */
  async history(
    params: { storeId: string; userId?: string; from?: string; to?: string },
    role: string,
    requestingUserId: string,
  ) {
    const tenant = requireTenant();
    await assertStoreAccess(this.prisma, {
      userId: requestingUserId,
      role,
      storeId: params.storeId,
    });

    const now = new Date();
    const { from, to } = this.resolveRange(params, 7, now);

    const entries = await this.prisma.timeClockEntry.findMany({
      where: {
        organizationId: tenant.organizationId,
        storeId: params.storeId,
        ...(params.userId ? { userId: params.userId } : {}),
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { name: true } },
        store: { select: { name: true } },
      },
    });

    return this.aggregateJornadas(entries, now);
  }

  /**
   * Historial cross-tienda para gestión (backoffice): las mismas jornadas que
   * history() pero agregando TODAS las tiendas de la organización (la RLS ya acota
   * por tenant). Solo ADMIN/MANAGER — lo gatea @Roles en el controller; aquí NO hay
   * assertStoreAccess porque no se opera sobre una tienda concreta (ambos roles son
   * org-wide, igual que salesStoreFilter). Ventana por defecto de 30 días; admite
   * filtros opcionales de tienda, empleado y rango.
   */
  async historyAll(params: { storeId?: string; userId?: string; from?: string; to?: string }) {
    const tenant = requireTenant();
    const now = new Date();
    const { from, to } = this.resolveRange(params, 30, now);

    const entries = await this.prisma.timeClockEntry.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(params.storeId ? { storeId: params.storeId } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { name: true } },
        store: { select: { name: true } },
      },
    });

    return this.aggregateJornadas(entries, now);
  }

  /**
   * Agrupa fichajes en jornadas (usuario + tienda + día) y calcula horas trabajadas
   * y de pausa. Compartido por history() (acotado a una tienda) y historyAll() (todas
   * las tiendas de la org). Incluir la tienda en la clave evita mezclar las jornadas
   * de un mismo empleado en dos tiendas el mismo día.
   */
  private aggregateJornadas(
    entries: ReadonlyArray<{
      type: TimeClockType;
      createdAt: Date;
      userId: string;
      storeId: string;
      user: { name: string };
      store: { name: string };
    }>,
    now: Date,
  ) {
    type Group = {
      userId: string;
      userName: string;
      storeId: string;
      storeName: string;
      date: string;
      rows: Array<{ type: TimeClockType; createdAt: Date }>;
    };
    const groups = new Map<string, Group>();
    for (const e of entries) {
      const date = localDayKey(e.createdAt);
      const key = `${e.userId}__${e.storeId}__${date}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          userId: e.userId,
          userName: e.user.name,
          storeId: e.storeId,
          storeName: e.store.name,
          date,
          rows: [],
        };
        groups.set(key, group);
      }
      group.rows.push({ type: e.type, createdAt: e.createdAt });
    }

    return [...groups.values()].map((g) => {
      const totals = computeWorked(g.rows, now);
      const firstIn = g.rows.find((r) => r.type === 'CLOCK_IN');
      const lastOut = [...g.rows].reverse().find((r) => r.type === 'CLOCK_OUT');
      return {
        userId: g.userId,
        userName: g.userName,
        storeId: g.storeId,
        storeName: g.storeName,
        date: g.date,
        firstIn: firstIn ? firstIn.createdAt.toISOString() : null,
        lastOut: lastOut ? lastOut.createdAt.toISOString() : null,
        workedMs: totalWorkedMs(totals, now),
        breakMs: totals.breakMs,
      };
    });
  }

  // Log de fichajes en BRUTO de una tienda (cada entrada individual con el nombre del
  // empleado), lo más reciente primero. A diferencia de history() (resumen por jornada),
  // alimenta el log del detalle de tienda del backoffice. Mismo control de acceso
  // (assertStoreAccess) y aislamiento por tenant que history.
  async entries(
    params: { storeId: string; userId?: string; from?: string; to?: string },
    role: string,
    requestingUserId: string,
  ): Promise<
    Array<{ id: string; userId: string; userName: string; type: TimeClockType; createdAt: string }>
  > {
    const tenant = requireTenant();
    await assertStoreAccess(this.prisma, {
      userId: requestingUserId,
      role,
      storeId: params.storeId,
    });

    const now = new Date();
    const { from, to } = this.resolveRange(params, 30, now);

    const rows = await this.prisma.timeClockEntry.findMany({
      where: {
        organizationId: tenant.organizationId,
        storeId: params.storeId,
        ...(params.userId ? { userId: params.userId } : {}),
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });

    return rows.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.user.name,
      type: e.type,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
