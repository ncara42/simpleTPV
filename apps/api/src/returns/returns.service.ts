import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { assertStoreAccess } from '../auth/store-access.js';
import { round2 } from '../common/money.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { type TxClient, withTenantTx } from '../prisma/with-tenant-tx.js';
import { StockService } from '../stock/stock.service.js';
import { VerifactuService } from '../verifactu/verifactu.service.js';
import { computeReturnable, computeReturnLineTotal } from './returns.domain.js';
import type { CreateBlindReturnDto, CreateReturnDto } from './returns.dto.js';

@Injectable()
export class ReturnsService {
  constructor(
    // Extendido: lecturas con RLS por-operación.
    private readonly prisma: PrismaService,
    // Base: para withTenantTx (una sola transacción atómica).
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    // Servicio interno de stock: repone el stock de las líneas devueltas.
    private readonly stock: StockService,
    // VeriFactu: registro rectificativo de cada devolución (SEC-07), creado en la
    // misma tx que la devolución (atómico) y enviado tras commit.
    private readonly verifactu: VerifactuService,
    // Feature flags (#127 B): gatea la devolución ciega por org/tienda. @Optional
    // para no romper construcciones directas en tests; en producción DI lo provee
    // (FeatureFlagsModule importado por ReturnsModule) y el enforcement es real.
    @Optional() private readonly features?: FeatureFlagService,
  ) {}

  /**
   * Crea el registro VeriFactu RECTIFICATION de una devolución DENTRO de su tx y
   * encola el envío tras commit (mismo patrón que la venta, SEC-02/SEC-07). El
   * importe va en negativo (abono). `invoiceNumber` referencia la factura original
   * (ticket de la venta) o, en devoluciones sin ticket, el id de la devolución.
   * El formato exacto de factura rectificativa AEAT se afinará al integrar el
   * proveedor certificado (hoy sandbox, no remite).
   */
  private async recordRectification(
    tx: TxClient,
    organizationId: string,
    afterCommit: (fn: () => Promise<void>) => void,
    params: { returnId: string; invoiceNumber: string; total: number },
  ): Promise<void> {
    const org = await tx.organization.findFirst({
      where: { id: organizationId },
      select: { nif: true },
    });
    const record = await this.verifactu.createRecordInTx(tx, organizationId, {
      type: 'RECTIFICATION',
      returnId: params.returnId,
      payload: {
        nif: org?.nif ?? null,
        invoiceNumber: params.invoiceNumber,
        date: new Date().toISOString(),
        total: -Math.abs(params.total),
        type: 'RECTIFICATION',
      },
    });
    afterCommit(async () => {
      await this.verifactu.enqueueSend(record.id, organizationId);
    });
  }

  /**
   * Crea una devolución parcial contra un ticket de venta. Todo dentro de
   * withTenantTx (cliente base) para que la validación y el create compartan UNA
   * transacción atómica con el tenant fijado (RLS aplicada).
   */
  async create(dto: CreateReturnDto, userId: string, role: string) {
    const tenant = requireTenant();

    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      // 0. Lock pesimista de la fila de la venta ANTES de leer las devoluciones
      //    previas. Serializa las devoluciones concurrentes de la MISMA venta:
      //    en READ COMMITTED (default) dos devoluciones simultáneas podrían leer
      //    ambas el mismo "ya devuelto", pasar la validación de exceso y crear
      //    sendos Return → se devolvería más de lo vendido. Con FOR UPDATE la
      //    segunda transacción espera al commit de la primera y entonces lee el
      //    "ya devuelto" actualizado → la validación de exceso la rechaza.
      //    El lock vive dentro de withTenantTx (sobre tx) y RLS ya restringe la
      //    fila al tenant; si la venta no existe, no bloquea ninguna fila y el
      //    findFirst posterior lanzará 404.
      await tx.$executeRaw`SELECT id FROM "Sale" WHERE id = ${dto.saleId}::uuid FOR UPDATE`;

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
      // Aislamiento por tienda (SEC-01): un CLERK solo devuelve ventas de las
      // tiendas a las que está asignado. La tienda la fija la venta original.
      await assertStoreAccess(tx, { userId, role, storeId: sale.storeId });

      const linesById = new Map(sale.lines.map((l) => [l.id, l]));

      // 2. Devoluciones previas de esta venta: sumamos lo ya devuelto por saleLine.
      const previous = await tx.returnLine.findMany({
        where: { saleLineId: { in: sale.lines.map((l) => l.id) } },
        select: { saleLineId: true, qty: true },
      });
      const returnedBySaleLine = new Map<string, number>();
      for (const rl of previous) {
        // saleLineId no es null aquí: el filtro `in` solo trae líneas con
        // saleLineId de esta venta (las devoluciones sin ticket no lo tienen).
        if (rl.saleLineId === null) {
          continue;
        }
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

      // 5. Crea el Return + sus ReturnLines (nested create), con organizationId
      //    en ambos. storeId/userId se toman de la venta y del usuario actual.
      const created = await tx.return.create({
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

      // 6. Repone el stock de cada línea devuelta dentro de la misma tx. Para
      //    productos con lote (#137) reingresa al LOTE ORIGINAL del que salió la
      //    venta (reconstruido desde sus movimientos SALE), capando por lote y
      //    descontando devoluciones previas; el resto, RETURN sin lote. referenceId
      //    = returnId para trazabilidad.
      for (const l of returnLines) {
        await this.stock.applyBatchedReturn(
          tx,
          {
            organizationId: tenant.organizationId,
            productId: l.productId,
            storeId: sale.storeId,
            originSaleId: sale.id,
            quantity: l.qty,
            referenceId: created.id,
            userId,
          },
          afterCommit,
        );
      }

      // 7. Registro VeriFactu rectificativo (SEC-07): referencia el ticket de la
      //    venta original. En la misma tx → atómico con la devolución.
      await this.recordRectification(tx, tenant.organizationId, afterCommit, {
        returnId: created.id,
        invoiceNumber: sale.ticketNumber,
        total,
      });

      return created;
    });
  }

  // Lockout en memoria (por réplica) contra fuerza bruta del PIN de autorización
  // (SEC-19): el PIN es de 4-8 dígitos y un acierto vale para CUALQUIER autorizador
  // del tenant, así que bajo el throttle global sería forzable en horas. Se acota
  // por usuario iniciador + tenant; tras N fallos se bloquea unos minutos.
  // S-09 (diferido): el Map es por proceso. Correcto con réplica única (Dokploy
  // hoy). Al escalar a varias réplicas, mover el contador a Redis (INCR+EXPIRE)
  // o dos réplicas permiten 2×N intentos antes del lockout.
  private readonly pinAttempts = new Map<string, { count: number; lockedUntil: number }>();
  private static readonly PIN_MAX_ATTEMPTS = 5;
  private static readonly PIN_LOCKOUT_MS = 5 * 60_000;

  private assertPinNotLocked(key: string): void {
    const entry = this.pinAttempts.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
      throw new ForbiddenException(
        'Demasiados intentos de PIN incorrectos; inténtalo de nuevo en unos minutos',
      );
    }
  }

  private registerPinFailure(key: string): void {
    const entry = this.pinAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= ReturnsService.PIN_MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + ReturnsService.PIN_LOCKOUT_MS;
      entry.count = 0;
    }
    this.pinAttempts.set(key, entry);
  }

  private clearPinFailures(key: string): void {
    this.pinAttempts.delete(key);
  }

  /**
   * Valida el PIN de un MANAGER/ADMIN del tenant. Devuelve el id del usuario que
   * autoriza si el PIN coincide con el de algún MANAGER/ADMIN; si no, lanza 403.
   * Compara contra todos los pinHash (bcrypt) de los autorizadores del tenant —
   * el volumen de MANAGER/ADMIN por tienda es pequeño.
   *
   * Control «cuatro ojos» (SEC, IDOR-02): se EXCLUYE al iniciador (`userId`) de la
   * lista de autorizadores. Sin esta exclusión, un MANAGER/ADMIN con PIN propio
   * podría auto-autorizar su devolución ciega (`authorizedBy === userId`),
   * anulando la doble aprobación de un segundo actor.
   */
  private async resolveAuthorizer(managerPin: string, userId: string): Promise<string> {
    const tenant = requireTenant();
    const authorizers = await this.prisma.user.findMany({
      where: {
        organizationId: tenant.organizationId,
        id: { not: userId },
        role: { in: ['MANAGER', 'ADMIN'] },
        active: true,
        pinHash: { not: null },
      },
      select: { id: true, pinHash: true },
    });
    for (const u of authorizers) {
      if (u.pinHash && (await bcrypt.compare(managerPin, u.pinHash))) {
        return u.id;
      }
    }
    throw new ForbiddenException('PIN de autorización inválido');
  }

  /**
   * Devolución SIN ticket (#59): no hay venta de referencia. Requiere el PIN de
   * un MANAGER/ADMIN que autoriza, motivo obligatorio, y repone el stock del
   * producto (movimiento RETURN). El importe de cada línea se calcula del precio
   * de venta ACTUAL del producto (salePrice) × qty. Todo en una tx atómica.
   */
  async createBlind(dto: CreateBlindReturnDto, userId: string, role: string) {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo hace devoluciones ciegas en
    // sus tiendas. Se comprueba antes que el PIN para fallar cuanto antes.
    await assertStoreAccess(this.prisma, { userId, role, storeId: dto.storeId });
    // Feature flag (#127 B): la devolución ciega puede estar apagada en esta tienda
    // u org → 403 antes de tocar nada. Sin flag → comportamiento actual (activa).
    await this.features?.assertEnabled('blind_returns', dto.storeId);
    // Autorización por PIN ANTES de abrir la tx (si falla, no toca nada), con
    // lockout anti-fuerza-bruta por usuario iniciador + tenant (SEC-19).
    const pinKey = `${tenant.organizationId}:${userId}`;
    this.assertPinNotLocked(pinKey);
    let authorizedBy: string;
    try {
      authorizedBy = await this.resolveAuthorizer(dto.managerPin, userId);
    } catch (err) {
      this.registerPinFailure(pinKey);
      throw err;
    }
    this.clearPinFailures(pinKey);

    // Precios actuales de los productos del tenant (fuente del importe).
    const productIds = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: tenant.organizationId },
      select: { id: true, salePrice: true },
    });
    const priceById = new Map(products.map((p) => [p.id, Number(p.salePrice)]));
    for (const l of dto.lines) {
      if (!priceById.has(l.productId)) {
        throw new BadRequestException(`Producto ${l.productId} no encontrado en la organización`);
      }
    }

    const returnLines = dto.lines.map((l) => ({
      organizationId: tenant.organizationId,
      productId: l.productId,
      qty: l.qty,
      lineTotal: round2(priceById.get(l.productId)! * l.qty),
    }));
    const total = round2(returnLines.reduce((acc, l) => acc + l.lineTotal, 0));

    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const created = await tx.return.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: dto.storeId,
          userId,
          authorizedBy,
          reason: dto.reason,
          total,
          lines: { create: returnLines },
        },
        include: { lines: true },
      });

      // Repone el stock de cada producto devuelto. Devolución ciega: NO hay venta de
      // origen → reingreso SIN lote (#137 D6a), no se conoce el lote original.
      for (const l of returnLines) {
        await this.stock.applyBatchedReturn(
          tx,
          {
            organizationId: tenant.organizationId,
            productId: l.productId,
            storeId: dto.storeId,
            originSaleId: null,
            quantity: l.qty,
            referenceId: created.id,
            userId,
          },
          afterCommit,
        );
      }

      // Registro VeriFactu rectificativo (SEC-07): sin factura original (devolución
      // sin ticket), referencia el id de la devolución. Atómico con la devolución.
      await this.recordRectification(tx, tenant.organizationId, afterCommit, {
        returnId: created.id,
        invoiceNumber: `BLIND-${created.id}`,
        total,
      });

      return created;
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
