import { Inject, Injectable } from '@nestjs/common';
import type { AlertType, MovementType } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { CACHE, type Cache } from '../cache/cache.interface.js';
import { EVENT_BUS, type EventBus } from '../events/event-bus.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { type AfterCommit, withTenantTx } from '../prisma/with-tenant-tx.js';

// Tope del tamaño de página de GET /stock/movements (SEC-09): el cliente controla
// pageSize, así que lo acotamos para no materializar todo el historial del tenant.
const MAX_MOVEMENTS_PAGE_SIZE = 100;

// Clave de cache del stock de un par producto+tienda dentro de un tenant.
export function stockCacheKey(organizationId: string, storeId: string, productId: string): string {
  return `stock:${organizationId}:${storeId}:${productId}`;
}

// Nivel de stock tipo semáforo, derivado de quantity vs minStock:
//   - red:    sin stock (quantity <= 0).
//   - yellow: en/por debajo del mínimo (0 < quantity <= minStock).
//   - green:  por encima del mínimo (quantity > minStock).
// Función pura, testeable. minStock 0 → solo red (<=0) o green (>0).
export type StockLevel = 'red' | 'yellow' | 'green';

export function stockLevel(quantity: number, minStock: number): StockLevel {
  if (quantity <= 0) {
    return 'red';
  }
  if (quantity <= minStock) {
    return 'yellow';
  }
  return 'green';
}

// Tipo de alerta que CORRESPONDE a un nivel de stock, o null si no hay alerta:
//   - OUT_OF_STOCK si quantity <= 0 (agotado).
//   - LOW_STOCK    si 0 < quantity <= minStock (bajo mínimo).
//   - null         si quantity > minStock (sin alerta).
// Función pura, testeable. Espeja stockLevel: red→OUT_OF_STOCK, yellow→LOW_STOCK.
export function alertTypeFor(quantity: number, minStock: number): AlertType | null {
  if (quantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (quantity <= minStock) {
    return 'LOW_STOCK';
  }
  return null;
}

// Orden de urgencia para listar alertas: OUT_OF_STOCK antes que LOW_STOCK.
export const ALERT_URGENCY: Record<AlertType, number> = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 1,
};

// Cliente transaccional de Prisma (lo que recibe el callback de $transaction),
// idéntico al tipo usado en with-tenant-tx. applyMovement opera SIEMPRE sobre un
// tx ya abierto por withTenantTx (con el tenant fijado), nunca abre el suyo.
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface ApplyMovementInput {
  organizationId: string;
  productId: string;
  storeId: string;
  type: MovementType;
  // Positivo = entrada (reposición), negativo = salida (venta). El stock puede
  // quedar negativo: la venta nunca se bloquea por falta de stock (decisión de
  // semana 3); el control de mínimos es vía alertas, no bloqueo.
  quantity: number;
  referenceId?: string;
  reason?: string;
  userId?: string;
}

@Injectable()
export class StockService {
  constructor(
    // Extendido: lecturas con RLS por-operación (las consultas de stock).
    private readonly prisma: PrismaService,
    @Inject(CACHE) private readonly cache: Cache,
    // Base: para withTenantTx (escrituras multi-tabla atómicas, p.ej. setMin).
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    // Bus de eventos para emitir stock.changed / alert.created tras commit (#32).
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /**
   * Aplica un movimiento de stock de forma atómica dentro de la transacción `tx`
   * recibida: upsert del Stock (incrementa/decrementa quantity) + registro del
   * StockMovement. DEBE llamarse dentro de un withTenantTx (tenant fijado), para
   * que ambas escrituras compartan la misma transacción y RLS quede aplicada.
   *
   * Devuelve la cantidad resultante en Stock tras el movimiento (útil para emitir
   * eventos / reevaluar alertas en issues posteriores).
   */
  async applyMovement(
    tx: TxClient,
    input: ApplyMovementInput,
    afterCommit?: AfterCommit,
  ): Promise<number> {
    const { organizationId, productId, storeId, type, quantity, referenceId, reason, userId } =
      input;

    const stock = await tx.stock.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: { quantity: { increment: quantity } },
      create: { organizationId, productId, storeId, quantity },
    });

    await tx.stockMovement.create({
      data: {
        organizationId,
        productId,
        storeId,
        type,
        quantity,
        ...(referenceId !== undefined ? { referenceId } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(userId !== undefined ? { userId } : {}),
      },
    });

    const resulting = Number(stock.quantity);

    // Reevalúa la alerta de stock mínimo dentro de la MISMA tx (#29): si el
    // movimiento cruza el mínimo dispara/actualiza alerta; si repone por encima,
    // la resuelve. Devuelve el tipo de alerta CREADA (nueva) para emitir el
    // evento alert.created tras commit, o null si no se creó ninguna.
    const createdAlert = await this.reevaluateAlert(
      tx,
      organizationId,
      productId,
      storeId,
      resulting,
      Number(stock.minStock),
    );

    // Actualiza el cache con la cantidad resultante. Best-effort: si el cache
    // falla no rompe el movimiento (la implementación no lanza). Postgres sigue
    // siendo la fuente de verdad; el cache solo acelera las lecturas (#28).
    await this.cache.set(stockCacheKey(organizationId, storeId, productId), String(resulting));

    // Eventos en tiempo real (#32) TRAS commit: stock.changed siempre, y
    // alert.created si se generó una alerta nueva. afterCommit garantiza que no
    // se emiten si la tx hace rollback.
    if (afterCommit) {
      afterCommit(async () => {
        await this.events.publish(organizationId, {
          type: 'stock.changed',
          data: { productId, storeId, quantity: resulting },
        });
        if (createdAlert) {
          await this.events.publish(organizationId, {
            type: 'alert.created',
            data: { productId, storeId, alertType: createdAlert },
          });
        }
      });
    }

    return resulting;
  }

  /**
   * Dispara, actualiza o resuelve la alerta de stock de un par producto+tienda
   * según la cantidad resultante vs su mínimo. Idempotente y seguro frente al
   * índice único parcial (una activa por par): usa updateMany condicional para no
   * duplicar. Corre dentro de la tx del movimiento (#29) o del ajuste de mínimo.
   */
  async reevaluateAlert(
    tx: TxClient,
    organizationId: string,
    productId: string,
    storeId: string,
    quantity: number,
    minStock: number,
  ): Promise<AlertType | null> {
    const wanted = alertTypeFor(quantity, minStock);
    const active = await tx.stockAlert.findFirst({
      where: { productId, storeId, organizationId, resolved: false },
    });

    if (wanted === null) {
      // Stock por encima del mínimo: resolver la alerta activa si existe.
      if (active) {
        await tx.stockAlert.update({
          where: { id: active.id },
          data: { resolved: true, resolvedAt: new Date() },
        });
      }
      return null;
    }

    if (!active) {
      // No hay alerta activa: crear una del tipo correspondiente. Se devuelve el
      // tipo para que el llamante emita alert.created tras commit (#32).
      await tx.stockAlert.create({
        data: { organizationId, productId, storeId, alertType: wanted },
      });
      return wanted;
    }

    // Ya hay alerta activa: si cambió el tipo (p.ej. LOW_STOCK → OUT_OF_STOCK al
    // agotarse), actualizarlo; si no, no-op (evita duplicar y churn). No es una
    // alerta NUEVA, así que no se emite alert.created.
    if (active.alertType !== wanted) {
      await tx.stockAlert.update({ where: { id: active.id }, data: { alertType: wanted } });
    }
    return null;
  }

  /**
   * Stock de todos los productos de una tienda: cantidad, mínimo y nivel
   * semáforo. RLS + organizationId explícito (defensa en profundidad). Lee de
   * Postgres (un único query con join al producto): la lista necesita
   * minStock/nombre que el cache puntual no guarda.
   */
  async byStore(storeId: string, userId: string, role: string) {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo ve stock de sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId });
    const rows = await this.prisma.stock.findMany({
      where: { storeId, organizationId: tenant.organizationId },
      include: { product: { select: { name: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    return rows.map((r) => {
      const quantity = Number(r.quantity);
      const minStock = Number(r.minStock);
      return {
        productId: r.productId,
        productName: r.product.name,
        storeId: r.storeId,
        quantity,
        minStock,
        level: stockLevel(quantity, minStock),
      };
    });
  }

  /**
   * Productos "para pedir" de una tienda (#45): los que están por debajo o en el
   * mínimo (nivel amarillo/rojo). Atajo sobre byStore para la vista de reposición.
   */
  async toReorder(storeId: string, userId: string, role: string) {
    // byStore aplica la comprobación de acceso por tienda (SEC-01).
    const rows = await this.byStore(storeId, userId, role);
    return rows.filter((r) => r.level !== 'green');
  }

  /**
   * Stock global agregado: por producto, su stock en cada tienda y el total del
   * tenant. Para la vista central del backoffice. RLS + organizationId explícito.
   */
  async global() {
    const tenant = requireTenant();
    const rows = await this.prisma.stock.findMany({
      where: { organizationId: tenant.organizationId },
      include: {
        product: { select: { name: true } },
        store: { select: { name: true } },
      },
    });

    const byProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        total: number;
        stores: Array<{
          storeId: string;
          storeName: string;
          quantity: number;
          minStock: number;
          level: StockLevel;
        }>;
      }
    >();

    for (const r of rows) {
      const quantity = Number(r.quantity);
      const minStock = Number(r.minStock);
      let entry = byProduct.get(r.productId);
      if (!entry) {
        entry = { productId: r.productId, productName: r.product.name, total: 0, stores: [] };
        byProduct.set(r.productId, entry);
      }
      entry.total += quantity;
      entry.stores.push({
        storeId: r.storeId,
        storeName: r.store.name,
        quantity,
        minStock,
        level: stockLevel(quantity, minStock),
      });
    }

    return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }

  /**
   * Stock de un producto en todas las tiendas del tenant. La cantidad puntual de
   * cada par producto+tienda se sirve desde el cache (Redis) si está; en miss,
   * cae a la quantity de Postgres y repuebla el cache. minStock/nivel siempre de
   * Postgres (el cache solo guarda quantity). RLS + organizationId explícito.
   */
  async byProduct(productId: string) {
    const tenant = requireTenant();
    const rows = await this.prisma.stock.findMany({
      where: { productId, organizationId: tenant.organizationId },
      include: { store: { select: { name: true } } },
      orderBy: { store: { name: 'asc' } },
    });

    return Promise.all(
      rows.map(async (r) => {
        const minStock = Number(r.minStock);
        const quantity = await this.cachedQuantity(
          tenant.organizationId,
          r.storeId,
          productId,
          Number(r.quantity),
        );
        return {
          productId,
          storeId: r.storeId,
          storeName: r.store.name,
          quantity,
          minStock,
          level: stockLevel(quantity, minStock),
        };
      }),
    );
  }

  /**
   * Cantidad de un par producto+tienda leyendo primero del cache; en miss usa el
   * valor de Postgres recibido (`fromDb`) y repuebla el cache. Si el cache está
   * caído, get devuelve null → usamos Postgres (degradación transparente).
   */
  private async cachedQuantity(
    organizationId: string,
    storeId: string,
    productId: string,
    fromDb: number,
  ): Promise<number> {
    const key = stockCacheKey(organizationId, storeId, productId);
    const cached = await this.cache.get(key);
    if (cached !== null) {
      const parsed = Number(cached);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    await this.cache.set(key, String(fromDb));
    return fromDb;
  }

  /**
   * Alertas de stock del tenant (#29). Filtra por tienda y por estado (por
   * defecto solo activas, resolved=false). Ordenadas por urgencia (OUT_OF_STOCK
   * antes que LOW_STOCK) y luego por antigüedad (más antiguas primero). RLS +
   * organizationId explícito.
   */
  async alerts({ storeId, resolved = false }: { storeId?: string; resolved?: boolean }) {
    const tenant = requireTenant();
    const rows = await this.prisma.stockAlert.findMany({
      where: {
        organizationId: tenant.organizationId,
        resolved,
        ...(storeId ? { storeId } : {}),
      },
      include: { product: { select: { name: true } }, store: { select: { name: true } } },
    });
    // Orden por urgencia y antigüedad. Lo hacemos en memoria porque el orden por
    // urgencia depende de un mapa (no de una columna), y el volumen de alertas
    // activas es pequeño.
    return rows
      .map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        storeId: r.storeId,
        storeName: r.store.name,
        alertType: r.alertType,
        resolved: r.resolved,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => {
        const byUrgency = ALERT_URGENCY[a.alertType] - ALERT_URGENCY[b.alertType];
        return byUrgency !== 0 ? byUrgency : a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Configura el stock mínimo de un producto en una tienda (#29). Actualiza
   * Stock.minStock y reevalúa la alerta (cambiar el mínimo puede disparar o
   * resolver), todo en una tx atómica. Si no existe la fila Stock del par, la
   * crea con quantity 0. RLS + organizationId explícito.
   */
  async setMin(productId: string, storeId: string, minStock: number) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const stock = await tx.stock.upsert({
        where: { productId_storeId: { productId, storeId } },
        update: { minStock },
        create: { organizationId: tenant.organizationId, productId, storeId, minStock },
      });
      const quantity = Number(stock.quantity);
      const createdAlert = await this.reevaluateAlert(
        tx,
        tenant.organizationId,
        productId,
        storeId,
        quantity,
        minStock,
      );
      // Si cambiar el mínimo disparó una alerta nueva, emítela tras commit (#32).
      if (createdAlert) {
        afterCommit(async () => {
          await this.events.publish(tenant.organizationId, {
            type: 'alert.created',
            data: { productId, storeId, alertType: createdAlert },
          });
        });
      }
      return {
        productId,
        storeId,
        quantity,
        minStock: Number(stock.minStock),
        level: stockLevel(quantity, minStock),
      };
    });
  }

  /**
   * Ajuste manual de inventario (#30): fija el stock de un producto+tienda a
   * `newQuantity`, calculando internamente el delta (newQuantity - actual) y
   * aplicándolo como movimiento ADJUSTMENT con el motivo. Atómico: lee la
   * cantidad actual con lock pesimista (FOR UPDATE) para que el delta sea
   * consistente bajo concurrencia, y applyMovement reevalúa las alertas dentro
   * de la misma tx. RLS + organizationId explícito.
   */
  async adjust(input: {
    productId: string;
    storeId: string;
    newQuantity: number;
    reason: string;
    userId: string;
  }) {
    const { productId, storeId, newQuantity, reason, userId } = input;
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      // Lock pesimista de la fila de Stock del par para serializar ajustes
      // concurrentes: dos ajustes simultáneos leerían el mismo "actual" y el
      // segundo pisaría al primero. Con FOR UPDATE el segundo espera y lee el
      // valor ya ajustado. Si no existe la fila, no bloquea ninguna (current 0).
      const rows = await tx.$queryRaw<Array<{ quantity: string }>>`
        SELECT quantity::text FROM "Stock"
        WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
        FOR UPDATE
      `;
      const current = rows.length > 0 ? Number(rows[0]!.quantity) : 0;
      const delta = newQuantity - current;

      const resulting = await this.applyMovement(
        tx,
        {
          organizationId: tenant.organizationId,
          productId,
          storeId,
          type: 'ADJUSTMENT',
          quantity: delta,
          reason,
          userId,
        },
        afterCommit,
      );

      const updated = await tx.stock.findFirstOrThrow({
        where: { productId, storeId, organizationId: tenant.organizationId },
      });
      const minStock = Number(updated.minStock);
      return {
        productId,
        storeId,
        quantity: resulting,
        minStock,
        level: stockLevel(resulting, minStock),
      };
    });
  }

  async confirmInventoryCount(
    input: {
      storeId: string;
      reason: string;
      lines: Array<{ productId: string; countedQuantity: number }>;
    },
    userId: string,
  ) {
    const results = [];
    for (const line of input.lines) {
      results.push(
        await this.adjust({
          productId: line.productId,
          storeId: input.storeId,
          newQuantity: line.countedQuantity,
          reason: input.reason,
          userId,
        }),
      );
    }
    return { storeId: input.storeId, adjusted: results };
  }

  /**
   * Historial de movimientos de stock del tenant (#32), filtrable por producto,
   * tienda y rango de fechas, paginado. Orden por createdAt descendente (lo más
   * reciente primero). Para la trazabilidad/timeline del backoffice. RLS +
   * organizationId explícito.
   */
  async movements({
    productId,
    storeId,
    from,
    to,
    page = 1,
    pageSize = 50,
  }: {
    productId?: string;
    storeId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const tenant = requireTenant();
    // Cota defensiva del tamaño de página (SEC-09): pageSize lo controla el cliente
    // (GET /stock/movements?pageSize=...); sin tope, un valor enorme materializaría
    // todo el historial de movimientos del tenant. Saneamos page/pageSize ante
    // valores no finitos, negativos o desproporcionados.
    const safePageSize = Number.isFinite(pageSize)
      ? Math.min(Math.max(1, Math.floor(pageSize)), MAX_MOVEMENTS_PAGE_SIZE)
      : 50;
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const createdAt =
      from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
    const where = {
      organizationId: tenant.organizationId,
      ...(productId ? { productId } : {}),
      ...(storeId ? { storeId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, page: safePage, pageSize: safePageSize, totalItems };
  }
}
