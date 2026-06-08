import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SaleStatus } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { round2 } from '../common/money.js';
import { EVENT_BUS, type EventBus } from '../events/event-bus.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import { StockService } from '../stock/stock.service.js';
import { VerifactuService } from '../verifactu/verifactu.service.js';
import { type AccountingSale, buildAccountingCsv } from './accounting-export.js';
import {
  assertDiscountWithinRoleLimit,
  buildTaxBreakdown,
  computeChange,
  computeTotals,
  dayRange,
  formatTicket,
  type PricedLine,
  type SaleRole,
  type TicketDiscount,
} from './sales.domain.js';
import type { CreateSaleDto } from './sales.dto.js';
import { type ReceiptData, renderReceiptHtml } from './sales-receipt.js';

// Los Decimal de Postgres llegan como string por el driver pg (y como Decimal por
// Prisma en los aggregate). `num` los normaliza a number con fallback a 0.
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Filtros del historial de ventas, compartidos por el listado (findSales), sus
// agregados y el export (generateExportCsv). Todos opcionales.
interface SalesFilterQuery {
  storeId?: string;
  date?: string;
  from?: string;
  to?: string;
  q?: string;
  userId?: string; // vendedor
  familyId?: string;
  status?: SaleStatus;
}

@Injectable()
export class SalesService {
  constructor(
    // Extendido: lecturas con RLS por-operación (p.ej. findMany de productos).
    private readonly prisma: PrismaService,
    // Base: para withTenantTx, que abre UNA sola transacción atómica.
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    // Servicio interno de stock: aplica movimientos dentro de la tx de la venta.
    private readonly stock: StockService,
    // Bus de eventos para emitir sale.completed tras commit (#32).
    @Inject(EVENT_BUS) private readonly events: EventBus,
    // Genera el registro VeriFactu de la venta tras commit (#47).
    private readonly verifactu: VerifactuService,
  ) {}

  async create(dto: CreateSaleDto, userId: string, role: SaleRole) {
    const tenant = requireTenant();

    // Idempotencia de ventas offline (offline slice 2): si esta venta ya se
    // sincronizó antes con este clientId, devuelve la existente sin recrearla ni
    // mover stock de nuevo. El índice único (organizationId, clientId) es el
    // backstop ante reenvíos concurrentes.
    if (dto.clientId) {
      const existing = await this.prisma.sale.findFirst({
        where: { clientId: dto.clientId, organizationId: tenant.organizationId },
        include: { lines: true },
      });
      if (existing) {
        return existing;
      }
    }

    // Aislamiento por tienda (SEC-01): un CLERK solo puede vender en las tiendas
    // a las que está asignado (UserStore). RLS aísla por org, no por tienda.
    await assertStoreAccess(this.prisma, { userId, role, storeId: dto.storeId });

    // Caja obligatoria: no se puede cobrar sin una sesión de caja abierta para
    // la tienda. Invierte la decisión "caja opcional" de #13 (ver spec
    // 2026-05-28-caja-obligatoria-design.md). El cliente extendido aplica RLS,
    // así que esta lectura solo ve cajas del tenant. Sin caja abierta → 409.
    const openSession = await this.prisma.cashSession.findFirst({
      where: { storeId: dto.storeId, organizationId: tenant.organizationId, status: 'OPEN' },
    });
    if (!openSession) {
      throw new ConflictException('No hay caja abierta en esta tienda');
    }

    // El cliente extendido ya aplica RLS por-operación: esta lectura solo ve
    // productos del tenant. Si falta alguno → error (no se mezcla con otro tenant).
    const ids = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Precio retail por tienda (#127 A): override del PVP del producto para ESTA
    // tienda. UN único findMany por (tienda, productos del ticket) evita el N+1.
    // Sin fila para un producto → cae al Product.salePrice (comportamiento por
    // defecto, tiendas sin pricing por tienda no notan nada). Mismo patrón que el
    // B2B (tarifa ?? salePrice). El precio lo SIGUE fijando el servidor: el cliente
    // nunca manda unitPrice; esto solo cambia DE DÓNDE sale.
    const overrides = await this.prisma.storePrice.findMany({
      where: {
        storeId: dto.storeId,
        productId: { in: ids },
        organizationId: tenant.organizationId,
      },
      select: { productId: true, price: true },
    });
    const priceByProduct = new Map(overrides.map((o) => [o.productId, Number(o.price)]));

    const priced: PricedLine[] = dto.lines.map((l) => {
      const product = byId.get(l.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${l.productId} no encontrado`);
      }
      return {
        productId: l.productId,
        name: product.name,
        unitPrice: priceByProduct.get(product.id) ?? Number(product.salePrice),
        qty: l.qty,
        // Mutuamente excluyentes: si llega importe fijo (>0) ignoramos el %, para
        // no persistir un discountPct que no se aplicó (el importe tiene precedencia).
        ...(l.discountAmt !== undefined && l.discountAmt > 0
          ? { discountAmt: l.discountAmt }
          : { discountPct: l.discountPct ?? 0 }),
        taxRate: Number(product.taxRate),
        // Congela el coste del producto en el momento de la venta (IT-03) para
        // una rentabilidad histórica fiable aunque el coste cambie después.
        costPrice: Number(product.costPrice),
      };
    });

    const ticket: TicketDiscount = {
      ...(dto.ticketDiscountPct !== undefined ? { ticketDiscountPct: dto.ticketDiscountPct } : {}),
      ...(dto.ticketDiscountAmt !== undefined ? { ticketDiscountAmt: dto.ticketDiscountAmt } : {}),
    };
    const { lines, subtotal, discountTotal, total } = computeTotals(priced, ticket);

    // Límite por rol sobre el % efectivo total (sobre el bruto, sin descuentos).
    const grossTotal = round2(priced.reduce((acc, l) => acc + l.unitPrice * l.qty, 0));
    assertDiscountWithinRoleLimit(role, discountTotal, grossTotal);

    const { cashGiven, cashChange } = computeChange(dto.paymentMethod, total, dto.cashGiven);

    // Usamos el cliente BASE (sin extensiones) para que withTenantTx abra UNA
    // sola transacción: el incremento del contador (tx.$queryRaw) y la creación
    // de la venta (tx.sale.create) corren en la MISMA tx con el set_config LOCAL
    // aplicado. Pasar el extendido anidaría transacciones y rompería la
    // atomicidad (contador incrementado aunque la venta falle).
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      let ticketNumber: string;
      if (dto.ticketNumber) {
        // Venta offline sincronizada (offline slice 2): usa el nº de ticket
        // pre-asignado de su bloque reservado (el contador ya se incrementó al
        // reservar el bloque). NO vuelve a incrementar el contador. El índice
        // único (organizationId, ticketNumber) evita colisiones.
        ticketNumber = dto.ticketNumber;
      } else {
        // Venta online: incremento atómico del contador de la tienda dentro de
        // la misma tx (el contador y la venta se confirman o revierten juntos).
        const updated = await tx.$queryRaw<Array<{ code: string; ticketCounter: number }>>`
          UPDATE "Store" SET "ticketCounter" = "ticketCounter" + 1
          WHERE id = ${dto.storeId}::uuid
          RETURNING code, "ticketCounter"
        `;
        const store = updated[0];
        if (!store) {
          throw new NotFoundException(`Tienda ${dto.storeId} no encontrada`);
        }
        ticketNumber = formatTicket(store.code, store.ticketCounter);
      }

      const sale = await tx.sale.create({
        data: {
          organizationId: tenant.organizationId,
          storeId: dto.storeId,
          userId,
          ticketNumber,
          clientId: dto.clientId ?? null,
          subtotal,
          discountTotal,
          total,
          paymentMethod: dto.paymentMethod,
          cashGiven,
          cashChange,
          lines: {
            create: lines.map((l) => ({
              organizationId: tenant.organizationId,
              productId: l.productId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
              discountPct: l.discountPct ?? 0,
              discountAmt: l.discountAmt,
              taxRate: l.taxRate ?? 21,
              costPrice: l.costPrice ?? 0,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });

      // Decrementa el stock de cada línea (salida tipo SALE), dentro de la MISMA
      // transacción de la venta → atómico. referenceId = saleId para trazar el
      // movimiento. El stock puede quedar negativo (no bloquea). afterCommit
      // propaga la emisión de stock.changed/alert.created tras commit.
      //
      // Lote (#126): los productos con tracksBatch salen por FEFO (consumo del lote
      // más próximo a caducar, con su batchId); el resto, salida directa. La
      // detección usa el producto ya cargado (byId), sin queries extra.
      for (const l of lines) {
        const out = {
          organizationId: tenant.organizationId,
          productId: l.productId,
          storeId: dto.storeId,
          type: 'SALE' as const,
          quantity: l.qty,
          referenceId: sale.id,
          userId,
        };
        if (byId.get(l.productId)?.tracksBatch) {
          await this.stock.applyFefoOutflow(tx, out, afterCommit);
          continue;
        }
        await this.stock.applyMovement(tx, { ...out, quantity: -l.qty }, afterCommit);
      }

      // Evento sale.completed tras commit (#32): payload mínimo de la venta.
      afterCommit(async () => {
        await this.events.publish(tenant.organizationId, {
          type: 'sale.completed',
          data: {
            saleId: sale.id,
            storeId: dto.storeId,
            ticketNumber,
            total: Number(total),
          },
        });
      });

      // Registro VeriFactu de la venta DENTRO de la transacción (#47, SEC-02):
      // atómico con la venta. Si la creación del registro fiscal encadenado falla,
      // toda la venta hace rollback → nunca queda una factura sin su registro
      // VeriFactu. Solo el ENVÍO a la AEAT es best-effort: se encola tras commit
      // (reintentable vía cola/worker), porque el registro ya está persistido.
      const org = await tx.organization.findFirst({
        where: { id: tenant.organizationId },
        select: { nif: true },
      });
      const verifactuRecord = await this.verifactu.createRecordInTx(tx, tenant.organizationId, {
        type: 'INVOICE',
        saleId: sale.id,
        payload: {
          nif: org?.nif ?? null,
          invoiceNumber: ticketNumber,
          date: new Date().toISOString(),
          total: Number(total),
          type: 'INVOICE',
        },
      });
      afterCommit(async () => {
        await this.verifactu.enqueueSend(verifactuRecord.id, tenant.organizationId);
      });

      return sale;
    });
  }

  // Reserva un bloque de N números de ticket para un dispositivo (offline slice 2):
  // incrementa el contador de la tienda en N de forma atómica y devuelve el rango
  // [from, to] + el code de la tienda. El TPV consume estos números offline y los
  // sincroniza luego en POST /sales (con ticketNumber pre-asignado + clientId).
  // Puede dejar huecos si el bloque no se agota — gaps justificados por reserva
  // (trade-off de la numeración offline por bloques).
  async reserveTicketBlock(
    storeId: string,
    size: number,
    userId: string,
    role: SaleRole,
  ): Promise<{ code: string; from: number; to: number }> {
    const tenant = requireTenant();
    await assertStoreAccess(this.prisma, { userId, role, storeId });
    return withTenantTx(this.base, tenant.organizationId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ code: string; ticketCounter: number }>>`
        UPDATE "Store" SET "ticketCounter" = "ticketCounter" + ${size}
        WHERE id = ${storeId}::uuid
        RETURNING code, "ticketCounter"
      `;
      const store = rows[0];
      if (!store) {
        throw new NotFoundException(`Tienda ${storeId} no encontrada`);
      }
      return { code: store.code, from: store.ticketCounter - size + 1, to: store.ticketCounter };
    });
  }

  /**
   * Carga una venta del tenant y construye el ticket-resumen (datos + IVA
   * desglosado). RLS aísla por tenant: una venta de otra organización no es
   * visible aquí (findFirst → null) → NotFoundException (404). El desglose de IVA
   * se calcula al vuelo desde el taxRate congelado de cada línea. Compartido por
   * `getTicket` (resumen JSON) y `getReceiptHtml` (documento fiscal imprimible).
   */
  private async loadTicketData(id: string) {
    // Defensa en profundidad: además de RLS (que ya filtra por tenant), filtramos
    // explícitamente por organizationId. El id es un UUID del cliente, así que no
    // dependemos solo de la policy para evitar IDOR entre tenants.
    const tenant = requireTenant();
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: { lines: true, store: true, organization: true },
    });
    if (!sale) {
      throw new NotFoundException(`Venta ${id} no encontrada`);
    }

    // El descuento de TICKET es subtotal − total (discountTotal incluye además
    // los descuentos de línea, que ya están reflejados en lineTotal). Lo pasamos
    // para que el desglose de IVA prorratee y Σ(base+cuota) == total.
    const ticketDiscount = round2(Number(sale.subtotal) - Number(sale.total));
    const taxBreakdown = buildTaxBreakdown(
      sale.lines.map((l) => ({ taxRate: Number(l.taxRate), lineTotal: Number(l.lineTotal) })),
      ticketDiscount,
    );

    return {
      organization: { name: sale.organization.name, nif: sale.organization.nif },
      store: { name: sale.store.name, code: sale.store.code },
      ticketNumber: sale.ticketNumber,
      createdAt: sale.createdAt,
      lines: sale.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        discountAmt: l.discountAmt,
        lineTotal: l.lineTotal,
      })),
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      cashGiven: sale.cashGiven,
      cashChange: sale.cashChange,
      taxBreakdown,
    };
  }

  /** Ticket-resumen JSON para el detalle/impresión del TPV (GET /sales/:id/ticket). */
  async getTicket(id: string) {
    return this.loadTicketData(id);
  }

  /**
   * Documento fiscal imprimible/descargable de la venta (#123): factura
   * simplificada en HTML autocontenido (NIF, fecha, nº ticket, líneas, desglose
   * de IVA, total, método de pago). El servidor es la fuente de verdad del
   * documento. Reutiliza `loadTicketData` (mismos datos que `getTicket`) y el
   * renderizado puro de `sales-receipt.ts`.
   *
   * Normaliza los Decimal de Prisma a number con `num()` en la frontera (mapeo
   * explícito y type-safe) para no acoplar el renderer puro al tipo Decimal ni
   * recurrir a un cast inseguro.
   */
  async getReceiptHtml(id: string): Promise<string> {
    const t = await this.loadTicketData(id);
    const data: ReceiptData = {
      ...t,
      lines: t.lines.map((l) => ({
        name: l.name,
        qty: num(l.qty),
        unitPrice: num(l.unitPrice),
        discountPct: num(l.discountPct),
        discountAmt: l.discountAmt === null ? null : num(l.discountAmt),
        lineTotal: num(l.lineTotal),
      })),
      subtotal: num(t.subtotal),
      discountTotal: num(t.discountTotal),
      total: num(t.total),
      cashGiven: t.cashGiven === null ? null : num(t.cashGiven),
      cashChange: t.cashChange === null ? null : num(t.cashChange),
    };
    return renderReceiptHtml(data);
  }

  /**
   * Localiza una venta del tenant por su número de ticket, con sus líneas. Sirve
   * al flujo de devolución del TPV (buscar el ticket por su nº impreso). RLS +
   * filtro por organizationId explícito; si no existe en el tenant → 404.
   */
  async findByTicket(ticketNumber: string) {
    const tenant = requireTenant();
    const sale = await this.prisma.sale.findFirst({
      where: { ticketNumber, organizationId: tenant.organizationId },
      include: { lines: true },
    });
    if (!sale) {
      throw new NotFoundException(`Ticket ${ticketNumber} no encontrado`);
    }
    return sale;
  }

  /**
   * Anula una venta del tenant (rol MANAGER/ADMIN, validado en el controller por
   * el RolesGuard global). Marca status=VOIDED, voidedAt=now y voidedBy=userId.
   *
   * Defensa en profundidad: además de RLS, filtramos explícitamente por
   * organizationId (mismo patrón que getTicket) para evitar IDOR entre tenants
   * con un id de otra organización → findFirst null → NotFound.
   *
   * Una venta anulada no debe contar en totales/historial (#14): cualquier
   * agregado DEBE filtrar status = COMPLETED.
   */
  async voidSale(id: string, userId: string) {
    const tenant = requireTenant();

    // Todo en una sola transacción atómica (cliente base): la transición de
    // estado y la reposición de stock de las líneas deben aplicarse juntas o no
    // aplicarse — si la reposición fallara, la anulación no debe quedar a medias.
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      // Bloqueo pesimista sobre la venta (S-10). `createReturn` también toma
      // FOR UPDATE sobre esta fila; sin él, anulación y devolución concurrentes
      // corren en transacciones distintas y, en READ COMMITTED, voidSale puede
      // leer return.count()=0 antes de que el commit de la devolución sea visible
      // → repondría el stock por segunda vez y dejaría un Return colgando de una
      // venta anulada. Con el lock, la segunda transacción espera al commit de la
      // primera y entonces ve el Return (→ 400) o el estado ya VOIDED.
      await tx.$executeRaw`SELECT id FROM "Sale" WHERE id = ${id}::uuid FOR UPDATE`;

      const sale = await tx.sale.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: { lines: true },
      });
      if (!sale) {
        throw new NotFoundException(`Venta ${id} no encontrada`);
      }
      if (sale.status === 'VOIDED') {
        throw new BadRequestException('La venta ya está anulada');
      }

      // No se puede anular una venta que ya tiene devoluciones: dejaría un Return
      // colgando contra una venta anulada, un estado incoherente.
      const returns = await tx.return.count({
        where: { saleId: id, organizationId: tenant.organizationId },
      });
      if (returns > 0) {
        throw new BadRequestException('No se puede anular una venta con devoluciones');
      }

      // Transición atómica: la condición status=COMPLETED viaja al WHERE de la DB,
      // así dos anulaciones concurrentes no pueden ambas tener éxito (la segunda
      // afecta 0 filas). organizationId en el WHERE refuerza el aislamiento del write.
      const updated = await tx.sale.updateMany({
        where: { id, organizationId: tenant.organizationId, status: 'COMPLETED' },
        data: { status: 'VOIDED', voidedAt: new Date(), voidedBy: userId },
      });
      if (updated.count === 0) {
        // Otra request la anuló entre la lectura y el update.
        throw new BadRequestException('La venta ya está anulada');
      }

      // Repone el stock de cada línea dentro de la misma tx que la anulación. Para
      // productos con lote (#137) revierte el consumo al LOTE ORIGINAL (reconstruido
      // desde los movimientos SALE de esta venta); el resto, RETURN sin lote. La
      // anulación solo procede si la venta no tiene devoluciones previas (validado
      // arriba), así que revierte el 100% del consumo. referenceId = saleId.
      for (const l of sale.lines) {
        await this.stock.applyBatchedReturn(
          tx,
          {
            organizationId: tenant.organizationId,
            productId: l.productId,
            storeId: sale.storeId,
            originSaleId: sale.id,
            quantity: Number(l.qty),
            referenceId: sale.id,
            userId,
          },
          afterCommit,
        );
      }

      // La venta existe y la acabamos de anular en esta misma tx → no es null.
      return tx.sale.findFirstOrThrow({
        where: { id, organizationId: tenant.organizationId },
      });
    });
  }

  /**
   * Historial de ventas paginado del tenant (#14). Filtros opcionales por tienda
   * y por día (rango UTC vía dayRange). Orden por createdAt descendente (lo más
   * reciente primero). Devuelve la página de items + metadatos de paginación +
   * totales.
   *
   * IMPORTANTE: `items` incluye ventas VOIDED (para auditoría visual con su
   * status), pero `totals` (count + totalAmount) agrega SOLO status=COMPLETED:
   * las anuladas se listan pero no suman en el importe del día.
   *
   * Defensa en profundidad: además de RLS, el where lleva organizationId explícito.
   */
  async findSales(
    query: SalesFilterQuery & { page?: number; pageSize?: number },
    requesterId = '',
    role: SaleRole = 'ADMIN',
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tenant = requireTenant();
    const { where, baseWhere, range, storeFilter, term } = await this.buildSalesFilter(
      query,
      requesterId,
      role,
    );

    const [items, totalItems, agg, marginRow] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          createdAt: true,
          total: true,
          paymentMethod: true,
          status: true,
          storeId: true,
          user: { select: { name: true } },
          store: { select: { name: true, code: true } },
        },
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({
        // Los totales solo cuentan ventas COMPLETED (las VOIDED no suman). subtotal
        // y discountTotal alimentan avgDiscountPct (= descuento / precio de tarifa).
        where: { ...baseWhere, status: 'COMPLETED' },
        _sum: { total: true, subtotal: true, discountTotal: true },
        _count: true,
      }),
      // Margen real sobre el coste CONGELADO en la línea (IT-03). Necesita un
      // producto de columnas (costPrice*qty) que el aggregate de Prisma no expresa,
      // así que va por SQL crudo dentro de withTenantTx (fija el tenant para RLS).
      withTenantTx(
        this.base,
        tenant.organizationId,
        (tx) =>
          tx.$queryRaw<Array<{ margin: string; revenue: string }>>`
          SELECT
            COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS margin,
            COALESCE(SUM(sl."lineTotal"), 0) AS revenue
          FROM "SaleLine" sl
          JOIN "Sale" sa ON sa.id = sl."saleId"
          WHERE ${this.completedSalesWhereSql({
            organizationId: tenant.organizationId,
            storeFilter,
            range,
            vendorId: query.userId,
            familyId: query.familyId,
            term,
          })}
        `,
      ),
    ]);

    const subtotal = num(agg._sum.subtotal);
    const discount = num(agg._sum.discountTotal);
    const revenue = num(marginRow[0]?.revenue);
    const margin = num(marginRow[0]?.margin);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totals: {
        count: agg._count,
        totalAmount: agg._sum.total ?? 0,
        // Tasa de descuento media: descuento de ticket / precio de tarifa
        // (subtotal neto de línea + descuento de ticket). Coherente con el dashboard.
        avgDiscountPct: subtotal + discount > 0 ? discount / (subtotal + discount) : 0,
        // Margen medio: margen real / facturación (neto de líneas). Usa costPrice congelado.
        avgMarginPct: revenue > 0 ? margin / revenue : 0,
      },
    };
  }

  // Construye el filtro Prisma del historial a partir de la query. `baseWhere` NO
  // incluye status (los agregados fuerzan COMPLETED); `where` sí lo añade para el
  // listado. Devuelve también las piezas (range/storeFilter/term) que el SQL de
  // margen necesita. Compartido por findSales y generateExportCsv (un único filtro).
  private async buildSalesFilter(query: SalesFilterQuery, requesterId: string, role: SaleRole) {
    const tenant = requireTenant();
    const storeFilter: { in: string[] } | string | undefined = await this.salesStoreFilter(
      query.storeId,
      requesterId,
      role,
    );
    const term = query.q?.trim() || undefined;

    // Rango de fechas: from/to (prioritario, abierto por un extremo si falta uno)
    // o un único `date`. dayRange(x).lt es el día siguiente, así que `to` es inclusivo.
    const range: { gte?: Date; lt?: Date } | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: dayRange(query.from).gte } : {}),
            ...(query.to ? { lt: dayRange(query.to).lt } : {}),
          }
        : query.date
          ? dayRange(query.date)
          : undefined;

    // Filtro base SIN status: lo comparten el listado (que añade el status pedido)
    // y los agregados (que SIEMPRE fuerzan COMPLETED — las VOIDED se listan pero no
    // suman en importe/margen/descuento).
    const baseWhere = {
      organizationId: tenant.organizationId,
      ...(storeFilter ? { storeId: storeFilter } : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.familyId ? { lines: { some: { product: { familyId: query.familyId } } } } : {}),
      ...(term
        ? {
            OR: [
              { ticketNumber: { contains: term, mode: 'insensitive' as const } },
              { user: { name: { contains: term, mode: 'insensitive' as const } } },
              { lines: { some: { name: { contains: term, mode: 'insensitive' as const } } } },
              ...(Number.isFinite(Number(term)) ? [{ total: Number(term) }] : []),
            ],
          }
        : {}),
    };
    const where = { ...baseWhere, ...(query.status ? { status: query.status } : {}) };
    return { where, baseWhere, range, storeFilter, term };
  }

  // Genera el CSV del historial de ventas que casa con `query` (mismo filtro que el
  // listado, SIN paginación: TODAS las filas). Lo invoca el worker de SalesExport.
  // Una fila por venta; importes con punto decimal y campos de texto escapados.
  async generateExportCsv(
    query: SalesFilterQuery,
    requesterId: string,
    role: SaleRole,
  ): Promise<{ csv: string; rowCount: number }> {
    const { where } = await this.buildSalesFilter(query, requesterId, role);
    const rows = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        ticketNumber: true,
        createdAt: true,
        status: true,
        paymentMethod: true,
        subtotal: true,
        discountTotal: true,
        total: true,
        user: { select: { name: true } },
        store: { select: { name: true, code: true } },
      },
    });
    // Escapa comillas/comas/saltos (mismo criterio que purchases.exportCsv).
    const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = 'ticket,fecha,tienda,vendedor,estado,metodo_pago,subtotal,descuento,total';
    const lines = rows.map((r) =>
      [
        esc(r.ticketNumber),
        r.createdAt.toISOString(),
        esc(r.store.name),
        esc(r.user.name),
        r.status,
        r.paymentMethod,
        String(r.subtotal),
        String(r.discountTotal),
        String(r.total),
      ].join(','),
    );
    return { csv: [header, ...lines].join('\n'), rowCount: rows.length };
  }

  /**
   * Genera el CSV CONTABLE (libro de IVA repercutido, #125) que casa con `query`:
   * mismo filtro que el listado/export, pero SOLO ventas COMPLETED (las facturas
   * emitidas válidas) y en orden cronológico. Carga las líneas de cada venta para
   * desglosar el IVA por tipo. Lo invoca el worker de SalesExport con format
   * 'accounting'. `rowCount` = nº de facturas exportadas.
   */
  async generateAccountingCsv(
    query: SalesFilterQuery,
    requesterId: string,
    role: SaleRole,
  ): Promise<{ csv: string; rowCount: number }> {
    const { where } = await this.buildSalesFilter(query, requesterId, role);
    const rows = await this.prisma.sale.findMany({
      // Libro de IVA: solo facturas COMPLETED (override del status del filtro).
      where: { ...where, status: 'COMPLETED' },
      orderBy: { createdAt: 'asc' },
      select: {
        ticketNumber: true,
        createdAt: true,
        paymentMethod: true,
        subtotal: true,
        total: true,
        store: { select: { name: true } },
        lines: { select: { taxRate: true, lineTotal: true } },
      },
    });
    const sales: AccountingSale[] = rows.map((r) => ({
      ticketNumber: r.ticketNumber,
      createdAt: r.createdAt,
      storeName: r.store.name,
      paymentMethod: r.paymentMethod,
      subtotal: Number(r.subtotal),
      total: Number(r.total),
      lines: r.lines.map((l) => ({ taxRate: Number(l.taxRate), lineTotal: Number(l.lineTotal) })),
    }));
    return buildAccountingCsv(sales);
  }

  // Construye el WHERE (Prisma.Sql parametrizado) de los agregados sobre ventas
  // COMPLETED del filtro actual. Replica el filtro estructurado de findSales
  // (tienda, rango, vendedor, familia y búsqueda libre) para que avgMarginPct —que
  // va por SQL crudo sobre SaleLine— cuadre con los totales calculados por Prisma.
  private completedSalesWhereSql(f: {
    organizationId: string;
    storeFilter: { in: string[] } | string | undefined;
    range: { gte?: Date; lt?: Date } | undefined;
    vendorId: string | undefined;
    familyId: string | undefined;
    term: string | undefined;
  }): Prisma.Sql {
    const conds: Prisma.Sql[] = [
      Prisma.sql`sa."organizationId" = ${f.organizationId}::uuid`,
      Prisma.sql`sa.status = 'COMPLETED'`,
    ];
    if (typeof f.storeFilter === 'string') {
      conds.push(Prisma.sql`sa."storeId" = ${f.storeFilter}::uuid`);
    } else if (f.storeFilter) {
      const ids = f.storeFilter.in;
      conds.push(
        ids.length > 0
          ? Prisma.sql`sa."storeId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`
          : Prisma.sql`FALSE`,
      );
    }
    if (f.range?.gte) conds.push(Prisma.sql`sa."createdAt" >= ${f.range.gte}`);
    if (f.range?.lt) conds.push(Prisma.sql`sa."createdAt" < ${f.range.lt}`);
    if (f.vendorId) conds.push(Prisma.sql`sa."userId" = ${f.vendorId}::uuid`);
    if (f.familyId) {
      conds.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "SaleLine" slf JOIN "Product" pf ON pf.id = slf."productId" WHERE slf."saleId" = sa.id AND pf."familyId" = ${f.familyId}::uuid)`,
      );
    }
    if (f.term) {
      const pat = `%${f.term}%`;
      const ors: Prisma.Sql[] = [
        Prisma.sql`sa."ticketNumber" ILIKE ${pat}`,
        Prisma.sql`EXISTS (SELECT 1 FROM "User" uq WHERE uq.id = sa."userId" AND uq.name ILIKE ${pat})`,
        Prisma.sql`EXISTS (SELECT 1 FROM "SaleLine" slq WHERE slq."saleId" = sa.id AND slq.name ILIKE ${pat})`,
      ];
      if (Number.isFinite(Number(f.term))) {
        ors.push(Prisma.sql`sa.total = ${Number(f.term)}`);
      }
      conds.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
    }
    return Prisma.join(conds, ' AND ');
  }

  private async salesStoreFilter(
    requestedStoreId: string | undefined,
    userId: string,
    role: SaleRole,
  ): Promise<{ in: string[] } | string | undefined> {
    if (role !== 'CLERK') {
      return requestedStoreId;
    }
    const tenant = requireTenant();
    const rows = await this.prisma.userStore.findMany({
      where: {
        userId,
        store: { organizationId: tenant.organizationId },
        ...(requestedStoreId ? { storeId: requestedStoreId } : {}),
      },
      select: { storeId: true },
    });
    const ids = rows.map((r) => r.storeId);
    if (requestedStoreId && ids.length === 0) {
      throw new ForbiddenException('No tienes acceso a esa tienda');
    }
    return { in: ids };
  }
}
