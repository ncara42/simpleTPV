import { Inject, Injectable } from '@nestjs/common';
import type { AlertType, MovementType } from '@simpletpv/db';

import { assertStoreAccess } from '../auth/store-access.js';
import { CACHE, type Cache } from '../cache/cache.interface.js';
import { EVENT_BUS, type EventBus } from '../events/event-bus.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { type AfterCommit, withTenantTx } from '../prisma/with-tenant-tx.js';
import {
  ALERT_URGENCY,
  alertTypeFor,
  allocateFefo,
  allocateReturnToBatches,
  type ConsumedBatch,
  daysUntil,
  EXPIRY_THRESHOLD_DAYS,
  expiryCutoff,
  expiryStatus,
  stockCacheKey,
  type StockLevel,
  stockLevel,
} from './stock.domain.js';

// Tope del tamaño de página de GET /stock/movements (SEC-09): el cliente controla
// pageSize, así que lo acotamos para no materializar todo el historial del tenant.
const MAX_MOVEMENTS_PAGE_SIZE = 100;

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
  // Lote afectado (#126): para productos con tracksBatch. En ENTRADA (quantity>0,
  // recepción) identifica/crea el StockBatch por (producto, tienda, lotCode) y lo
  // incrementa; el batchId resultante se graba en el movimiento (trazabilidad
  // lote → ticket). En SALIDA por FEFO (slice 3) se llama por lote ya elegido.
  batch?: { lotCode: string; expiryDate?: Date | null };
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
   *
   * INVARIANTE (#126): para productos con tracksBatch, toda SALIDA (quantity<0)
   * debe pasar `batch` (el lote elegido por FEFO, slice 3) para que Stock(agregado)
   * y Σ StockBatch sigan cuadrando. Las ENTRADAS (recepción) pasan el lote recibido.
   */
  async applyMovement(
    tx: TxClient,
    input: ApplyMovementInput,
    afterCommit?: AfterCommit,
  ): Promise<number> {
    const {
      organizationId,
      productId,
      storeId,
      type,
      quantity,
      referenceId,
      reason,
      userId,
      batch,
    } = input;

    const stock = await tx.stock.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: { quantity: { increment: quantity } },
      create: { organizationId, productId, storeId, quantity },
    });

    // Lote (#126): si el movimiento afecta a un lote, upsert del StockBatch por
    // (producto, tienda, lotCode) incrementando por `quantity` (negativo si es
    // salida de un lote ya elegido). El batchId se graba en el movimiento. Stock
    // (agregado) y StockBatch se mueven juntos en la misma tx → Stock = Σ lotes.
    let batchId: string | undefined;
    if (batch) {
      const row = await tx.stockBatch.upsert({
        where: { productId_storeId_lotCode: { productId, storeId, lotCode: batch.lotCode } },
        update: {
          quantity: { increment: quantity },
          // Solo actualiza la caducidad si llega una fecha real (`!= null`): una
          // reposición del mismo lote sin fecha NO debe borrar la existente.
          ...(batch.expiryDate != null ? { expiryDate: batch.expiryDate } : {}),
        },
        create: {
          organizationId,
          productId,
          storeId,
          lotCode: batch.lotCode,
          expiryDate: batch.expiryDate ?? null,
          quantity,
        },
      });
      batchId = row.id;
    }

    await tx.stockMovement.create({
      data: {
        organizationId,
        productId,
        storeId,
        type,
        quantity,
        ...(referenceId !== undefined ? { referenceId } : {}),
        ...(batchId !== undefined ? { batchId } : {}),
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
   * Salida de stock por FEFO (#126) para un producto con lote: consume de los
   * lotes con stock por caducidad ASCENDENTE (más próxima a caducar primero), un
   * movimiento por lote (con su batchId). Si los lotes no cubren la cantidad, el
   * faltante sale SIN lote — la venta no se bloquea (decisión Q3), igual que el
   * stock agregado puede quedar negativo. DEBE correr dentro de un withTenantTx.
   * `quantity` es la cantidad POSITIVA a retirar. Devuelve el stock agregado final.
   *
   * Concurrencia: lee los lotes sin lock (coherente con el flujo de venta actual,
   * que tampoco bloquea); dos ventas simultáneas del mismo producto podrían
   * sobre-consumir un lote (quedaría negativo), aceptable bajo la filosofía
   * no-bloqueante y poco frecuente.
   */
  async applyFefoOutflow(
    tx: TxClient,
    input: {
      organizationId: string;
      productId: string;
      storeId: string;
      type: MovementType;
      quantity: number;
      referenceId?: string;
      userId?: string;
    },
    afterCommit?: AfterCommit,
  ): Promise<number> {
    const { organizationId, productId, storeId, type, quantity, referenceId, userId } = input;
    const common = {
      organizationId,
      productId,
      storeId,
      type,
      ...(referenceId !== undefined ? { referenceId } : {}),
      ...(userId !== undefined ? { userId } : {}),
    };

    // Lotes con stock, en orden FEFO (caducidad asc, NULLs al final; desempate por
    // antigüedad de creación).
    const batches = await tx.stockBatch.findMany({
      where: { organizationId, productId, storeId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const allocation = allocateFefo(
      batches.map((b) => ({ lotCode: b.lotCode, quantity: Number(b.quantity) })),
      quantity,
    );

    // Cantidad agregada de partida (por si quantity fuese 0 y no hubiese movimientos).
    const current = await tx.stock.findFirst({
      where: { productId, storeId, organizationId },
      select: { quantity: true },
    });
    let resulting = Number(current?.quantity ?? 0);

    // Un movimiento por lote consumido (salida, con su lote).
    for (const a of allocation.consumed) {
      resulting = await this.applyMovement(
        tx,
        { ...common, quantity: -a.qty, batch: { lotCode: a.lotCode } },
        afterCommit,
      );
    }
    // Faltante (vender más de lo recibido): salida sin lote, no bloquea.
    if (allocation.shortfall > 0) {
      resulting = await this.applyMovement(
        tx,
        { ...common, quantity: -allocation.shortfall },
        afterCommit,
      );
    }
    return resulting;
  }

  /**
   * Reingreso a lote(s) original(es) de una salida previa (#137): la imagen espejo
   * de applyFefoOutflow. Para un producto con lote, reconstruye de qué lote salió la
   * mercancía leyendo los movimientos SALE de la venta de origen (su batchId), y
   * reingresa la cantidad devuelta a esos lotes por orden de consumo (FEFO), capando
   * cada lote por lo que de él salió menos lo ya reingresado en devoluciones previas
   * de ESA venta (idempotencia de parciales encadenadas). El faltante (vendido sin
   * lote) y las devoluciones SIN venta de origen (ciegas) reingresan SIN lote (D6a).
   * `quantity` es la cantidad POSITIVA a reingresar. Devuelve el stock agregado final.
   * DEBE correr dentro de un withTenantTx (tenant fijado).
   *
   * Productos sin tracksBatch: atajo a un único RETURN sin lote (flujo de siempre).
   */
  async applyBatchedReturn(
    tx: TxClient,
    input: {
      organizationId: string;
      productId: string;
      storeId: string;
      // Venta de la que salió la mercancía (para leer sus movimientos SALE). null en
      // devoluciones sin ticket (ciegas): no hay lote original conocido → sin lote.
      originSaleId: string | null;
      quantity: number;
      referenceId?: string;
      userId?: string;
    },
    afterCommit?: AfterCommit,
  ): Promise<number> {
    const { organizationId, productId, storeId, originSaleId, quantity, referenceId, userId } =
      input;
    const common = {
      organizationId,
      productId,
      storeId,
      type: 'RETURN' as const,
      ...(referenceId !== undefined ? { referenceId } : {}),
      ...(userId !== undefined ? { userId } : {}),
    };

    // Devolución ciega (sin venta de origen): no hay lote original conocido →
    // reingreso SIN lote (D6a). No consulta el producto ni los movimientos.
    if (!originSaleId) {
      return this.applyMovement(tx, { ...common, quantity }, afterCommit);
    }

    const product = await tx.product.findFirst({
      where: { id: productId },
      select: { tracksBatch: true },
    });

    // Producto sin tracking de lote: reingreso SIN lote (flujo de siempre). No
    // descuadra: no salió ni entra a ningún StockBatch.
    if (!product?.tracksBatch) {
      return this.applyMovement(tx, { ...common, quantity }, afterCommit);
    }

    // Lotes que la venta consumió (movimientos SALE con batchId), en orden FEFO
    // (orden de creación). Agregamos lo consumido por lote.
    const saleMovs = await tx.stockMovement.findMany({
      where: { organizationId, productId, type: 'SALE', referenceId: originSaleId },
      orderBy: { createdAt: 'asc' },
      select: { batchId: true, quantity: true },
    });
    const consumedMap = new Map<string, number>();
    for (const m of saleMovs) {
      if (m.batchId == null) {
        continue; // faltante vendido sin lote → no atribuible a lote.
      }
      consumedMap.set(m.batchId, (consumedMap.get(m.batchId) ?? 0) + Math.abs(Number(m.quantity)));
    }
    const consumed: ConsumedBatch[] = [...consumedMap].map(([batchId, qty]) => ({ batchId, qty }));

    // Ya reingresado por lote en devoluciones previas de ESTA venta: devoluciones con
    // ticket (referenceId = returnId de un Return con saleId = originSaleId) y la
    // anulación (referenceId = originSaleId). Evita reingresar dos veces al mismo lote
    // al encadenar devoluciones parciales (D3).
    const priorReturns = await tx.return.findMany({
      where: { saleId: originSaleId, organizationId },
      select: { id: true },
    });
    const refIds = [...priorReturns.map((r) => r.id), originSaleId];
    const retMovs = await tx.stockMovement.findMany({
      where: { organizationId, productId, type: 'RETURN', referenceId: { in: refIds } },
      select: { batchId: true, quantity: true },
    });
    const alreadyReturned: Record<string, number> = {};
    for (const m of retMovs) {
      if (m.batchId == null) {
        continue;
      }
      alreadyReturned[m.batchId] = (alreadyReturned[m.batchId] ?? 0) + Number(m.quantity);
    }

    const allocation = allocateReturnToBatches(consumed, alreadyReturned, quantity);

    // batchId → lotCode: applyMovement reingresa por (producto, tienda, lotCode),
    // reactivando el lote existente (upsert) sin tocar su caducidad (D7).
    const batchIds = allocation.perBatch.map((p) => p.batchId);
    const batchRows = batchIds.length
      ? await tx.stockBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, lotCode: true },
        })
      : [];
    const lotById = new Map(batchRows.map((b) => [b.id, b.lotCode]));

    // Stock agregado de partida (por si quantity fuese 0 / sin reingresos).
    const current = await tx.stock.findFirst({
      where: { productId, storeId, organizationId },
      select: { quantity: true },
    });
    let resulting = Number(current?.quantity ?? 0);

    for (const p of allocation.perBatch) {
      const lotCode = lotById.get(p.batchId);
      if (lotCode === undefined) {
        continue; // defensivo: el lote debería existir (no se borran al llegar a 0).
      }
      resulting = await this.applyMovement(
        tx,
        { ...common, quantity: p.qty, batch: { lotCode } },
        afterCommit,
      );
    }
    if (allocation.noLot > 0) {
      resulting = await this.applyMovement(
        tx,
        { ...common, quantity: allocation.noLot },
        afterCommit,
      );
    }
    return resulting;
  }

  /**
   * Entrada en destino de un traspaso de un producto con lote (#138): el lote +
   * caducidad VIAJA del origen al destino. Reconstruye los lotes que salieron del
   * origen leyendo los movimientos TRANSFER_OUT del traspaso (su batchId), reparte
   * lo realmente RECIBIDO sobre esos lotes por orden de envío (capado por lo enviado
   * de cada lote) y crea/incrementa el MISMO lote (lotCode + expiryDate del origen)
   * en la tienda destino. El exceso (recibido > enviado) entra SIN lote (no
   * atribuible a un lote enviado), igual que el faltante FEFO. `quantityReceived` es
   * POSITIVO. Devuelve el stock agregado final del destino. DEBE correr en withTenantTx.
   *
   * Productos sin lote: sus TRANSFER_OUT no llevan batchId → todo cae en "sin lote"
   * → una entrada TRANSFER_IN directa (flujo de siempre), sin necesidad de gating.
   */
  async applyTransferReceipt(
    tx: TxClient,
    input: {
      organizationId: string;
      productId: string;
      destStoreId: string;
      // Traspaso de origen (para leer sus movimientos TRANSFER_OUT).
      transferId: string;
      quantityReceived: number;
      referenceId?: string;
      userId?: string;
    },
    afterCommit?: AfterCommit,
  ): Promise<number> {
    const {
      organizationId,
      productId,
      destStoreId,
      transferId,
      quantityReceived,
      referenceId,
      userId,
    } = input;
    const common = {
      organizationId,
      productId,
      storeId: destStoreId,
      type: 'TRANSFER_IN' as const,
      ...(referenceId !== undefined ? { referenceId } : {}),
      ...(userId !== undefined ? { userId } : {}),
    };

    // Lotes enviados desde el origen (movimientos TRANSFER_OUT del traspaso con
    // batchId), en orden de envío (= FEFO del origen). Agrega lo enviado por lote.
    const outMovs = await tx.stockMovement.findMany({
      where: { organizationId, productId, type: 'TRANSFER_OUT', referenceId: transferId },
      orderBy: { createdAt: 'asc' },
      select: { batchId: true, quantity: true },
    });
    const sentByBatch = new Map<string, number>();
    for (const m of outMovs) {
      if (m.batchId == null) {
        continue; // faltante enviado sin lote → no atribuible a lote.
      }
      sentByBatch.set(m.batchId, (sentByBatch.get(m.batchId) ?? 0) + Math.abs(Number(m.quantity)));
    }
    const consumed: ConsumedBatch[] = [...sentByBatch].map(([batchId, qty]) => ({ batchId, qty }));

    // Reparte lo recibido sobre los lotes enviados (capado, orden de envío); el
    // exceso cae en noLot → entra sin lote (D4). Sin idempotencia (se recibe una vez).
    const allocation = allocateReturnToBatches(consumed, {}, quantityReceived);

    // batchId (lote ORIGEN) → lotCode + expiryDate: el lote viaja con su caducidad.
    const batchIds = allocation.perBatch.map((p) => p.batchId);
    const batchRows = batchIds.length
      ? await tx.stockBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, lotCode: true, expiryDate: true },
        })
      : [];
    const originById = new Map(batchRows.map((b) => [b.id, b]));

    // Stock agregado de partida del destino (por si quantityReceived fuese 0).
    const current = await tx.stock.findFirst({
      where: { productId, storeId: destStoreId, organizationId },
      select: { quantity: true },
    });
    let resulting = Number(current?.quantity ?? 0);

    for (const p of allocation.perBatch) {
      const origin = originById.get(p.batchId);
      if (origin === undefined) {
        continue; // defensivo: el lote origen debería existir.
      }
      resulting = await this.applyMovement(
        tx,
        // El lote se recrea en destino con su MISMA caducidad (lot travels).
        {
          ...common,
          quantity: p.qty,
          batch: { lotCode: origin.lotCode, expiryDate: origin.expiryDate },
        },
        afterCommit,
      );
    }
    if (allocation.noLot > 0) {
      resulting = await this.applyMovement(
        tx,
        { ...common, quantity: allocation.noLot },
        afterCommit,
      );
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
      include: {
        product: { select: { name: true, familyId: true } },
        store: { select: { name: true } },
      },
    });

    // Anti-rotura por arquetipo (IT-13): el arquetipo de un producto es su familia
    // (mismo `familyId` = productos sustituibles). Una alerta se DEGRADA a 'soft' si
    // hay un sustituto (otro producto de la misma familia) con stock en esa tienda —
    // si se acaba el de sandía pero queda el de fresa, no es rotura real. Solo es
    // 'critical' cuando ningún sustituto tiene stock (el arquetipo entero está caído).
    const familyIds = [
      ...new Set(rows.map((r) => r.product.familyId).filter((f): f is string => !!f)),
    ];
    const substitutes = familyIds.length
      ? await this.prisma.stock.findMany({
          where: {
            organizationId: tenant.organizationId,
            quantity: { gt: 0 },
            product: { familyId: { in: familyIds }, active: true },
            ...(storeId ? { storeId } : {}),
          },
          select: { storeId: true, productId: true, product: { select: { familyId: true } } },
        })
      : [];
    // (familyId|storeId) → productos de esa familia con stock en esa tienda.
    const stockedByFamilyStore = new Map<string, Set<string>>();
    for (const s of substitutes) {
      const key = `${s.product.familyId}|${s.storeId}`;
      (stockedByFamilyStore.get(key) ?? stockedByFamilyStore.set(key, new Set()).get(key)!).add(
        s.productId,
      );
    }

    // Orden: críticas primero; dentro, por urgencia de tipo y antigüedad. Lo hacemos
    // en memoria (el orden depende de mapas, no de columnas, y el volumen es pequeño).
    return rows
      .map((r) => {
        const fam = r.product.familyId;
        const stocked = fam
          ? (stockedByFamilyStore.get(`${fam}|${r.storeId}`) ?? new Set<string>())
          : new Set<string>();
        // Hay sustituto si OTRO producto de la familia tiene stock en la tienda.
        const hasSubstituteStock = [...stocked].some((pid) => pid !== r.productId);
        return {
          id: r.id,
          productId: r.productId,
          productName: r.product.name,
          storeId: r.storeId,
          storeName: r.store.name,
          alertType: r.alertType,
          hasSubstituteStock,
          severity: hasSubstituteStock ? ('soft' as const) : ('critical' as const),
          resolved: r.resolved,
          createdAt: r.createdAt,
        };
      })
      .sort((a, b) => {
        const bySeverity =
          (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1);
        if (bySeverity !== 0) return bySeverity;
        const byUrgency = ALERT_URGENCY[a.alertType] - ALERT_URGENCY[b.alertType];
        return byUrgency !== 0 ? byUrgency : a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Lotes caducados o próximos a caducar del tenant (#126 slice 4). Caducidad
   * computada ON-READ (sin cron ni tabla de alertas persistida, decisión Q2):
   * devuelve los StockBatch con stock (`quantity > 0`) y con fecha cuya caducidad
   * cae dentro de la ventana `withinDays` (incluye los YA caducados). Ordenados
   * por caducidad ascendente (lo más urgente primero). Surfaced en la vista de
   * Notificaciones del backoffice junto a las alertas de stock. RLS +
   * organizationId explícito (defensa en profundidad). Filtro opcional por tienda.
   */
  async expiringBatches({
    storeId,
    withinDays,
  }: {
    storeId?: string;
    withinDays?: number;
  } = {}) {
    const tenant = requireTenant();
    // Saneamos la ventana (la controla el cliente vía query): no finita o negativa
    // → default 30 días (Q5). Sin tope superior: una ventana grande solo amplía el
    // barrido de lotes con caducidad, acotado de por sí por el volumen del tenant.
    const days =
      withinDays !== undefined && Number.isFinite(withinDays) && withinDays >= 0
        ? Math.floor(withinDays)
        : EXPIRY_THRESHOLD_DAYS;
    const today = new Date();
    const cutoff = expiryCutoff(today, days);

    const rows = await this.prisma.stockBatch.findMany({
      where: {
        organizationId: tenant.organizationId,
        quantity: { gt: 0 },
        // expiryDate <= hoy+N captura caducados (pasado) y por-caducar (ventana).
        // Los lotes sin caducidad (null) quedan fuera: no tienen riesgo temporal.
        expiryDate: { not: null, lte: cutoff },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        product: { select: { name: true } },
        store: { select: { name: true } },
      },
      orderBy: [{ expiryDate: 'asc' }, { lotCode: 'asc' }],
    });

    return rows.map((r) => {
      // expiryDate no es null aquí (filtrado arriba); el `!` es seguro.
      const expiry = r.expiryDate!;
      return {
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        storeId: r.storeId,
        storeName: r.store.name,
        lotCode: r.lotCode,
        expiryDate: expiry.toISOString().slice(0, 10),
        quantity: Number(r.quantity),
        daysToExpiry: daysUntil(expiry, today),
        // 'expired' | 'expiring' (la query excluye 'ok').
        status: expiryStatus(expiry, today, days),
      };
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
  // Ajuste de stock de un par producto+tienda DENTRO de una tx ya abierta. Toma
  // lock pesimista de la fila de Stock (FOR UPDATE) para serializar ajustes
  // concurrentes del par y aplica el movimiento en la MISMA tx. Lo comparten
  // `adjust` (un par) y `confirmInventoryCount` (recuento completo en una sola tx).
  private async adjustInTx(
    tx: TxClient,
    organizationId: string,
    input: {
      productId: string;
      storeId: string;
      newQuantity: number;
      reason: string;
      userId: string;
    },
    afterCommit: AfterCommit,
  ) {
    const { productId, storeId, newQuantity, reason, userId } = input;
    // FOR UPDATE: dos ajustes simultáneos leerían el mismo "actual" y el segundo
    // pisaría al primero. Con el lock el segundo espera y lee el valor ya ajustado.
    // Si no existe la fila, no bloquea ninguna (current 0).
    const rows = await tx.$queryRaw<Array<{ quantity: string }>>`
      SELECT quantity::text FROM "Stock"
      WHERE "productId" = ${productId}::uuid AND "storeId" = ${storeId}::uuid
      FOR UPDATE
    `;
    const current = rows.length > 0 ? Number(rows[0]!.quantity) : 0;
    const delta = newQuantity - current;

    const resulting = await this.applyMovement(
      tx,
      { organizationId, productId, storeId, type: 'ADJUSTMENT', quantity: delta, reason, userId },
      afterCommit,
    );

    const updated = await tx.stock.findFirstOrThrow({
      where: { productId, storeId, organizationId },
    });
    const minStock = Number(updated.minStock);
    return {
      productId,
      storeId,
      quantity: resulting,
      minStock,
      level: stockLevel(resulting, minStock),
    };
  }

  async adjust(input: {
    productId: string;
    storeId: string;
    newQuantity: number;
    reason: string;
    userId: string;
  }) {
    const tenant = requireTenant();
    return withTenantTx(this.base, tenant.organizationId, (tx, afterCommit) =>
      this.adjustInTx(tx, tenant.organizationId, input, afterCommit),
    );
  }

  async confirmInventoryCount(
    input: {
      storeId: string;
      reason: string;
      lines: Array<{ productId: string; countedQuantity: number }>;
    },
    userId: string,
  ) {
    const tenant = requireTenant();
    // S-11: TODO el recuento en UNA sola tx. Antes era una tx por línea (N
    // transacciones independientes): un recuento concurrente sobre pares
    // solapados podía interleaver lecturas y, si fallaba la línea k, dejaba las
    // k-1 anteriores ya aplicadas. Con una única tx, los FOR UPDATE de cada par
    // se mantienen hasta el commit → el recuento es atómico y serializado.
    return withTenantTx(this.base, tenant.organizationId, async (tx, afterCommit) => {
      const adjusted = [];
      for (const line of input.lines) {
        adjusted.push(
          await this.adjustInTx(
            tx,
            tenant.organizationId,
            {
              productId: line.productId,
              storeId: input.storeId,
              newQuantity: line.countedQuantity,
              reason: input.reason,
              userId,
            },
            afterCommit,
          ),
        );
      }
      return { storeId: input.storeId, adjusted };
    });
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
