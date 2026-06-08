import { describe, expect, it, vi } from 'vitest';

import { MemoryCache } from '../cache/memory-cache.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { tenantStorage } from '../prisma/tenant-context.js';
import { alertTypeFor, stockCacheKey, stockLevel } from './stock.domain.js';
import { StockService } from './stock.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// Mock del cliente transaccional (lo que applyMovement recibe como `tx`). Solo
// declaramos stock.upsert y stockMovement.create, que es lo que toca.
function makeTx(resultingQuantity = 0, minStock = 0) {
  return {
    stock: {
      upsert: vi.fn(async (_a?: unknown) => ({ quantity: resultingQuantity, minStock })),
      // applyFefoOutflow lee el agregado de partida (#126).
      findFirst: vi.fn(async (_a?: unknown) => ({ quantity: resultingQuantity })),
    },
    stockMovement: {
      create: vi.fn(async (_a?: unknown) => ({ id: 'mov-1' })),
    },
    // Lote (#126): applyMovement hace upsert del StockBatch si llega `batch`;
    // applyFefoOutflow lee los lotes con stock por FEFO.
    stockBatch: {
      upsert: vi.fn(async (_a?: unknown) => ({ id: 'batch-1' })),
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
    },
    // applyMovement reevalúa la alerta tras el movimiento (#29).
    stockAlert: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (_a?: unknown) => ({ id: 'alert-1' })),
      update: vi.fn(async (_a?: unknown) => ({ id: 'alert-1' })),
    },
  };
}

describe('StockService.applyMovement', () => {
  it('salida (venta): upsert con increment negativo + movimiento SALE', async () => {
    const tx = makeTx(98);
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const result = await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: -2,
      referenceId: 'sale-1',
      userId: 'user-1',
    });

    // upsert: where por la clave compuesta producto+tienda, increment = quantity.
    const upsertArg = tx.stock.upsert.mock.calls[0]![0] as {
      where: { productId_storeId: { productId: string; storeId: string } };
      update: { quantity: { increment: number } };
      create: { organizationId: string; quantity: number };
    };
    expect(upsertArg.where.productId_storeId).toEqual({ productId: 'p1', storeId: 'store-1' });
    expect(upsertArg.update.quantity.increment).toBe(-2);
    expect(upsertArg.create.quantity).toBe(-2);
    expect(upsertArg.create.organizationId).toBe(ORG);

    // movimiento con type, quantity, referenceId y userId.
    const movArg = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { type: string; quantity: number; referenceId?: string; userId?: string };
    };
    expect(movArg.data.type).toBe('SALE');
    expect(movArg.data.quantity).toBe(-2);
    expect(movArg.data.referenceId).toBe('sale-1');
    expect(movArg.data.userId).toBe('user-1');

    // devuelve la cantidad resultante del stock.
    expect(result).toBe(98);
  });

  it('con lote (#126): upsert del StockBatch y batchId en el movimiento', async () => {
    const tx = makeTx(112);
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'PURCHASE_RECEIPT',
      quantity: 10,
      batch: { lotCode: 'L-2026-01', expiryDate: new Date('2027-01-01') },
    });

    // Upsert del lote por (producto, tienda, lotCode), incrementando por quantity.
    const batchArg = tx.stockBatch.upsert.mock.calls[0]![0] as {
      where: { productId_storeId_lotCode: { productId: string; storeId: string; lotCode: string } };
      update: { quantity: { increment: number }; expiryDate?: Date };
      create: {
        organizationId: string;
        lotCode: string;
        quantity: number;
        expiryDate: Date | null;
      };
    };
    expect(batchArg.where.productId_storeId_lotCode).toEqual({
      productId: 'p1',
      storeId: 'store-1',
      lotCode: 'L-2026-01',
    });
    expect(batchArg.update.quantity.increment).toBe(10);
    expect(batchArg.create.lotCode).toBe('L-2026-01');

    // El movimiento graba el batchId devuelto por el upsert.
    const movArg = tx.stockMovement.create.mock.calls[0]![0] as { data: { batchId?: string } };
    expect(movArg.data.batchId).toBe('batch-1');
  });

  it('sin lote: no toca StockBatch y el movimiento no lleva batchId', async () => {
    const tx = makeTx(100);
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: -1,
    });

    expect(tx.stockBatch.upsert).not.toHaveBeenCalled();
    const movArg = tx.stockMovement.create.mock.calls[0]![0] as { data: { batchId?: string } };
    expect(movArg.data.batchId).toBeUndefined();
  });

  it('entrada (reposición): increment positivo + movimiento RETURN', async () => {
    const tx = makeTx(102);
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'RETURN',
      quantity: 2,
    });

    const upsertArg = tx.stock.upsert.mock.calls[0]![0] as {
      update: { quantity: { increment: number } };
    };
    expect(upsertArg.update.quantity.increment).toBe(2);

    const movArg = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { type: string; quantity: number; referenceId?: string; reason?: string };
    };
    expect(movArg.data.type).toBe('RETURN');
    expect(movArg.data.quantity).toBe(2);
    // sin referenceId/reason → no se incluyen (claves opcionales omitidas).
    expect(movArg.data.referenceId).toBeUndefined();
    expect(movArg.data.reason).toBeUndefined();
  });

  it('ajuste con motivo: pasa reason al movimiento ADJUSTMENT', async () => {
    const tx = makeTx(50);
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'ADJUSTMENT',
      quantity: -50,
      reason: 'merma por rotura',
    });

    const movArg = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { type: string; reason?: string };
    };
    expect(movArg.data.type).toBe('ADJUSTMENT');
    expect(movArg.data.reason).toBe('merma por rotura');
  });

  it('escribe la cantidad resultante en el cache tras el movimiento', async () => {
    const tx = makeTx(98);
    const cache = new MemoryCache();
    const service = new StockService({} as never, cache, {} as never, new InMemoryEventBus());

    await service.applyMovement(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: -2,
    });

    // Clave stock:{org}:{store}:{product} con la quantity resultante (98).
    expect(await cache.get(`stock:${ORG}:store-1:p1`)).toBe('98');
  });
});

describe('StockService.applyFefoOutflow', () => {
  function makeService() {
    return new StockService({} as never, new MemoryCache(), {} as never, new InMemoryEventBus());
  }

  it('consume lotes por FEFO: un movimiento por lote con su upsert (decremento)', async () => {
    const tx = makeTx(0);
    tx.stockBatch.findMany = vi.fn(async () => [
      { lotCode: 'A', quantity: 3 },
      { lotCode: 'B', quantity: 10 },
    ]);

    await makeService().applyFefoOutflow(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: 5,
      referenceId: 'sale-1',
      userId: 'u',
    });

    // Lote A agotado (−3) y lote B parcial (−2): dos upserts y dos movimientos.
    expect(tx.stockBatch.upsert).toHaveBeenCalledTimes(2);
    const a = tx.stockBatch.upsert.mock.calls[0]![0] as {
      where: { productId_storeId_lotCode: { lotCode: string } };
      update: { quantity: { increment: number } };
    };
    expect(a.where.productId_storeId_lotCode.lotCode).toBe('A');
    expect(a.update.quantity.increment).toBe(-3);
    const b = tx.stockBatch.upsert.mock.calls[1]![0] as {
      update: { quantity: { increment: number } };
    };
    expect(b.update.quantity.increment).toBe(-2);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it('faltante (vender más de lo recibido): el sobrante sale SIN lote', async () => {
    const tx = makeTx(0);
    tx.stockBatch.findMany = vi.fn(async () => [{ lotCode: 'A', quantity: 2 }]);

    await makeService().applyFefoOutflow(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: 5,
    });

    // Un movimiento por el lote A (−2) y otro por el faltante (−3) sin lote.
    expect(tx.stockBatch.upsert).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    const movs = tx.stockMovement.create.mock.calls.map(
      (c) => (c[0] as { data: { batchId?: string; quantity: number } }).data,
    );
    // El movimiento del faltante no lleva batchId y es −3.
    const shortfall = movs.find((m) => m.batchId === undefined);
    expect(shortfall?.quantity).toBe(-3);
  });

  it('sin lotes: toda la salida va sin lote (no bloquea)', async () => {
    const tx = makeTx(0);
    // findMany por defecto devuelve [] (sin lotes).
    await makeService().applyFefoOutflow(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 'store-1',
      type: 'SALE',
      quantity: 4,
    });
    expect(tx.stockBatch.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const mov = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { quantity: number; batchId?: string };
    };
    expect(mov.data.quantity).toBe(-4);
    expect(mov.data.batchId).toBeUndefined();
  });
});

describe('StockService.applyBatchedReturn', () => {
  // Mock de tx con todo lo que toca applyBatchedReturn: lectura del producto, de los
  // movimientos SALE/RETURN, de los Return de la venta, del mapeo batchId→lotCode y
  // las escrituras de applyMovement (upserts + movimiento + alerta).
  function makeReturnTx(opts: {
    tracksBatch?: boolean;
    saleMovs?: Array<{ batchId: string | null; quantity: number }>;
    retMovs?: Array<{ batchId: string | null; quantity: number }>;
    priorReturns?: Array<{ id: string }>;
    batchRows?: Array<{ id: string; lotCode: string }>;
    currentQty?: number;
  }) {
    const movementCreate = vi.fn(async (_a?: unknown) => ({ id: 'mov' }));
    const batchUpsert = vi.fn(async (_a?: unknown) => ({ id: 'b' }));
    const movementFindMany = vi.fn(async (a: { where: { type: string } }) =>
      a.where.type === 'SALE' ? (opts.saleMovs ?? []) : (opts.retMovs ?? []),
    );
    const tx = {
      product: { findFirst: vi.fn(async () => ({ tracksBatch: opts.tracksBatch ?? true })) },
      return: { findMany: vi.fn(async () => opts.priorReturns ?? []) },
      stockMovement: { findMany: movementFindMany, create: movementCreate },
      stockBatch: { findMany: vi.fn(async () => opts.batchRows ?? []), upsert: batchUpsert },
      stock: {
        upsert: vi.fn(async () => ({ quantity: opts.currentQty ?? 0, minStock: 0 })),
        findFirst: vi.fn(async () => ({ quantity: opts.currentQty ?? 0 })),
      },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'a' })),
        update: vi.fn(async () => ({})),
      },
    };
    return { tx, movementCreate, batchUpsert, movementFindMany };
  }

  function makeService() {
    return new StockService({} as never, new MemoryCache(), {} as never, new InMemoryEventBus());
  }

  // Lote por lotCode reingresado (where.productId_storeId_lotCode.lotCode) → increment.
  function batchUpsertsByLot(batchUpsert: ReturnType<typeof vi.fn>) {
    return batchUpsert.mock.calls.map((c) => {
      const a = c[0] as {
        where: { productId_storeId_lotCode: { lotCode: string } };
        update: { quantity: { increment: number } };
      };
      return {
        lotCode: a.where.productId_storeId_lotCode.lotCode,
        inc: a.update.quantity.increment,
      };
    });
  }

  it('producto con lote: reingresa al lote original (devolución total revierte el consumo)', async () => {
    const { tx, batchUpsert, movementCreate } = makeReturnTx({
      saleMovs: [
        { batchId: 'bid-A', quantity: -3 },
        { batchId: 'bid-B', quantity: -2 },
      ],
      batchRows: [
        { id: 'bid-A', lotCode: 'L-A' },
        { id: 'bid-B', lotCode: 'L-B' },
      ],
    });

    await makeService().applyBatchedReturn(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 's1',
      originSaleId: 'sale-1',
      quantity: 5,
      referenceId: 'ret-1',
    });

    expect(batchUpsertsByLot(batchUpsert)).toEqual([
      { lotCode: 'L-A', inc: 3 },
      { lotCode: 'L-B', inc: 2 },
    ]);
    // Dos movimientos RETURN (uno por lote), ninguno sin lote.
    expect(movementCreate).toHaveBeenCalledTimes(2);
  });

  it('devolución parcial con reingreso previo: capa el lote agotado y pasa al siguiente', async () => {
    const { tx, batchUpsert } = makeReturnTx({
      saleMovs: [
        { batchId: 'bid-A', quantity: -3 },
        { batchId: 'bid-B', quantity: -5 },
      ],
      // Ya se reingresaron 3 al lote A en una devolución previa de esta venta.
      priorReturns: [{ id: 'ret-prev' }],
      retMovs: [{ batchId: 'bid-A', quantity: 3 }],
      batchRows: [{ id: 'bid-B', lotCode: 'L-B' }],
    });

    await makeService().applyBatchedReturn(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 's1',
      originSaleId: 'sale-1',
      quantity: 2,
      referenceId: 'ret-2',
    });

    // A está capado (3/3) → todo va a B.
    expect(batchUpsertsByLot(batchUpsert)).toEqual([{ lotCode: 'L-B', inc: 2 }]);
  });

  it('faltante: lo no atribuible a lote se reingresa SIN lote', async () => {
    const { tx, batchUpsert, movementCreate } = makeReturnTx({
      saleMovs: [
        { batchId: 'bid-A', quantity: -2 },
        { batchId: null, quantity: -3 }, // faltante vendido sin lote
      ],
      batchRows: [{ id: 'bid-A', lotCode: 'L-A' }],
    });

    await makeService().applyBatchedReturn(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 's1',
      originSaleId: 'sale-1',
      quantity: 5,
      referenceId: 'ret-3',
    });

    expect(batchUpsertsByLot(batchUpsert)).toEqual([{ lotCode: 'L-A', inc: 2 }]);
    // Un movimiento con lote (L-A, +2) + uno sin lote por el faltante (+3).
    const noLotMov = movementCreate.mock.calls
      .map((c) => (c[0] as { data: { batchId?: string; quantity: number } }).data)
      .find((d) => d.batchId === undefined);
    expect(noLotMov?.quantity).toBe(3);
  });

  it('devolución ciega (sin venta de origen): reingreso SIN lote, no consulta movimientos', async () => {
    const { tx, batchUpsert, movementCreate, movementFindMany } = makeReturnTx({});

    await makeService().applyBatchedReturn(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 's1',
      originSaleId: null,
      quantity: 4,
      referenceId: 'ret-blind',
    });

    expect(movementFindMany).not.toHaveBeenCalled();
    expect(batchUpsert).not.toHaveBeenCalled();
    expect(movementCreate).toHaveBeenCalledTimes(1);
    const mov = movementCreate.mock.calls[0]![0] as {
      data: { quantity: number; batchId?: string };
    };
    expect(mov.data.quantity).toBe(4);
    expect(mov.data.batchId).toBeUndefined();
  });

  it('producto sin tracksBatch: atajo a un RETURN sin lote', async () => {
    const { tx, batchUpsert, movementCreate, movementFindMany } = makeReturnTx({
      tracksBatch: false,
    });

    await makeService().applyBatchedReturn(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      storeId: 's1',
      originSaleId: 'sale-1',
      quantity: 3,
      referenceId: 'ret-4',
    });

    expect(movementFindMany).not.toHaveBeenCalled();
    expect(batchUpsert).not.toHaveBeenCalled();
    expect(movementCreate).toHaveBeenCalledTimes(1);
  });
});

describe('StockService.applyTransferReceipt', () => {
  // Mock de tx para applyTransferReceipt: lee los TRANSFER_OUT del traspaso, mapea
  // batchId→lotCode/expiryDate del lote origen y recrea los lotes en destino.
  function makeReceiptTx(opts: {
    outMovs?: Array<{ batchId: string | null; quantity: number }>;
    batchRows?: Array<{ id: string; lotCode: string; expiryDate: Date | null }>;
    currentQty?: number;
  }) {
    const movementCreate = vi.fn(async (_a?: unknown) => ({ id: 'mov' }));
    const batchUpsert = vi.fn(async (_a?: unknown) => ({ id: 'b' }));
    const tx = {
      stockMovement: {
        findMany: vi.fn(async () => opts.outMovs ?? []),
        create: movementCreate,
      },
      stockBatch: { findMany: vi.fn(async () => opts.batchRows ?? []), upsert: batchUpsert },
      stock: {
        upsert: vi.fn(async () => ({ quantity: opts.currentQty ?? 0, minStock: 0 })),
        findFirst: vi.fn(async () => ({ quantity: opts.currentQty ?? 0 })),
      },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'a' })),
        update: vi.fn(async () => ({})),
      },
    };
    return { tx, movementCreate, batchUpsert };
  }

  function makeService() {
    return new StockService({} as never, new MemoryCache(), {} as never, new InMemoryEventBus());
  }

  // Reingresos a lote: lotCode, increment y la caducidad que viaja (create.expiryDate).
  function inboundLots(batchUpsert: ReturnType<typeof vi.fn>) {
    return batchUpsert.mock.calls.map((c) => {
      const a = c[0] as {
        where: { productId_storeId_lotCode: { lotCode: string } };
        update: { quantity: { increment: number } };
        create: { expiryDate: Date | null };
      };
      return {
        lotCode: a.where.productId_storeId_lotCode.lotCode,
        inc: a.update.quantity.increment,
        expiry: a.create.expiryDate,
      };
    });
  }

  it('recrea en destino los lotes enviados con su MISMA caducidad (recibido == enviado)', async () => {
    const expA = new Date('2026-06-01');
    const expB = new Date('2027-01-01');
    const { tx, batchUpsert, movementCreate } = makeReceiptTx({
      outMovs: [
        { batchId: 'bo-A', quantity: -3 },
        { batchId: 'bo-B', quantity: -2 },
      ],
      batchRows: [
        { id: 'bo-A', lotCode: 'L-A', expiryDate: expA },
        { id: 'bo-B', lotCode: 'L-B', expiryDate: expB },
      ],
    });

    await makeService().applyTransferReceipt(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      destStoreId: 'dest-1',
      transferId: 'tr-1',
      quantityReceived: 5,
      referenceId: 'tr-1',
    });

    expect(inboundLots(batchUpsert)).toEqual([
      { lotCode: 'L-A', inc: 3, expiry: expA },
      { lotCode: 'L-B', inc: 2, expiry: expB },
    ]);
    // Movimientos TRANSFER_IN al destino, uno por lote, ninguno sin lote.
    const types = movementCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(types).toEqual(['TRANSFER_IN', 'TRANSFER_IN']);
  });

  it('merma (recibido < enviado): reparte lo recibido por orden de envío, capado', async () => {
    const { tx, batchUpsert } = makeReceiptTx({
      outMovs: [
        { batchId: 'bo-A', quantity: -3 },
        { batchId: 'bo-B', quantity: -2 },
      ],
      batchRows: [
        { id: 'bo-A', lotCode: 'L-A', expiryDate: new Date('2026-06-01') },
        { id: 'bo-B', lotCode: 'L-B', expiryDate: new Date('2027-01-01') },
      ],
    });

    await makeService().applyTransferReceipt(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      destStoreId: 'dest-1',
      transferId: 'tr-1',
      quantityReceived: 4,
    });

    // L-A recupera sus 3, L-B solo 1 (la merma se queda en tránsito).
    expect(inboundLots(batchUpsert).map((x) => ({ lotCode: x.lotCode, inc: x.inc }))).toEqual([
      { lotCode: 'L-A', inc: 3 },
      { lotCode: 'L-B', inc: 1 },
    ]);
  });

  it('exceso (recibido > enviado): el sobrante entra SIN lote', async () => {
    const { tx, batchUpsert, movementCreate } = makeReceiptTx({
      outMovs: [
        { batchId: 'bo-A', quantity: -3 },
        { batchId: 'bo-B', quantity: -2 },
      ],
      batchRows: [
        { id: 'bo-A', lotCode: 'L-A', expiryDate: new Date('2026-06-01') },
        { id: 'bo-B', lotCode: 'L-B', expiryDate: new Date('2027-01-01') },
      ],
    });

    await makeService().applyTransferReceipt(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      destStoreId: 'dest-1',
      transferId: 'tr-1',
      quantityReceived: 6, // 5 enviados + 1 de exceso
    });

    // Los dos lotes recuperan lo enviado (3 + 2)…
    expect(inboundLots(batchUpsert).map((x) => x.inc)).toEqual([3, 2]);
    // …y el exceso (1) entra como TRANSFER_IN sin lote.
    const noLotMov = movementCreate.mock.calls
      .map((c) => (c[0] as { data: { batchId?: string; quantity: number } }).data)
      .find((d) => d.batchId === undefined);
    expect(noLotMov?.quantity).toBe(1);
  });

  it('producto sin lote (TRANSFER_OUT sin batchId): entrada directa sin lote', async () => {
    const { tx, batchUpsert, movementCreate } = makeReceiptTx({
      outMovs: [{ batchId: null, quantity: -5 }],
    });

    await makeService().applyTransferReceipt(tx as never, {
      organizationId: ORG,
      productId: 'p1',
      destStoreId: 'dest-1',
      transferId: 'tr-1',
      quantityReceived: 5,
    });

    expect(batchUpsert).not.toHaveBeenCalled();
    expect(movementCreate).toHaveBeenCalledTimes(1);
    const mov = movementCreate.mock.calls[0]![0] as {
      data: { quantity: number; batchId?: string };
    };
    expect(mov.data.quantity).toBe(5);
    expect(mov.data.batchId).toBeUndefined();
  });
});

describe('stockLevel', () => {
  it('rojo si quantity <= 0', () => {
    expect(stockLevel(0, 5)).toBe('red');
    expect(stockLevel(-3, 5)).toBe('red');
  });

  it('amarillo si 0 < quantity <= minStock', () => {
    expect(stockLevel(5, 5)).toBe('yellow');
    expect(stockLevel(2, 5)).toBe('yellow');
  });

  it('verde si quantity > minStock', () => {
    expect(stockLevel(6, 5)).toBe('green');
  });

  it('con minStock 0: solo rojo (<=0) o verde (>0)', () => {
    expect(stockLevel(0, 0)).toBe('red');
    expect(stockLevel(1, 0)).toBe('green');
  });
});

// Mock del cliente extendido para las consultas (stock.findMany con include).
function makeQueryPrisma(rows: unknown[], sold: unknown[] = []) {
  return {
    stock: {
      findMany: vi.fn(async (_a?: unknown) => rows),
    },
    // Unidades vendidas por producto (groupBy de SaleLine) para la rotación de global().
    saleLine: {
      groupBy: vi.fn(async (_a?: unknown) => sold),
    },
  };
}

describe('StockService.byStore', () => {
  it('mapea cada fila a quantity/minStock/nivel y exige tenant', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 0, minStock: 5, product: { name: 'Café' } },
      { productId: 'p2', storeId: 's1', quantity: 8, minStock: 5, product: { name: 'Té' } },
    ]);
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const rows = await tenantStorage.run({ organizationId: ORG }, () =>
      service.byStore('s1', 'user-1', 'ADMIN'),
    );

    expect(rows[0]).toMatchObject({ productId: 'p1', level: 'red', quantity: 0 });
    expect(rows[1]).toMatchObject({ productId: 'p2', level: 'green', quantity: 8 });
    // El where lleva organizationId explícito (defensa en profundidad).
    const arg = prisma.stock.findMany.mock.calls[0]![0] as {
      where: { storeId: string; organizationId: string };
    };
    expect(arg.where.organizationId).toBe(ORG);
  });
});

describe('StockService.toReorder', () => {
  it('devuelve solo los productos que no están en verde', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 0, minStock: 5, product: { name: 'Café' } }, // red
      { productId: 'p2', storeId: 's1', quantity: 3, minStock: 5, product: { name: 'Té' } }, // yellow
      { productId: 'p3', storeId: 's1', quantity: 8, minStock: 5, product: { name: 'Vape' } }, // green
    ]);
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const rows = await tenantStorage.run({ organizationId: ORG }, () =>
      service.toReorder('s1', 'user-1', 'ADMIN'),
    );

    expect(rows.map((r) => r.productId)).toEqual(['p1', 'p2']);
    expect(rows.every((r) => r.level !== 'green')).toBe(true);
  });
});

describe('StockService.global', () => {
  it('agrega por producto el stock de cada tienda, el total y la rotación', async () => {
    const prisma = makeQueryPrisma(
      [
        {
          productId: 'p1',
          storeId: 's1',
          quantity: 10,
          minStock: 5,
          product: { name: 'Café' },
          store: { name: 'Centro' },
        },
        {
          productId: 'p1',
          storeId: 's2',
          quantity: 3,
          minStock: 5,
          product: { name: 'Café' },
          store: { name: 'Sur' },
        },
        {
          productId: 'p2',
          storeId: 's1',
          quantity: 50,
          minStock: 5,
          product: { name: 'Té' },
          store: { name: 'Centro' },
        },
      ],
      // p1 vendió 40 uds (≥30 → alta); p2 sin ventas → baja.
      [{ productId: 'p1', _sum: { qty: 40 } }],
    );
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.global());

    const cafe = rows.find((r) => r.productId === 'p1')!;
    const te = rows.find((r) => r.productId === 'p2')!;
    expect(cafe.total).toBe(13);
    expect(cafe.stores).toHaveLength(2);
    expect(cafe.stores.find((s) => s.storeId === 's2')!.level).toBe('yellow');
    expect(cafe.rotation).toBe('alta'); // 40 uds vendidas
    expect(te.rotation).toBe('baja'); // sin ventas en la ventana
  });
});

describe('StockService.byProduct (cache)', () => {
  it('hit: devuelve la quantity del cache, no la de Postgres', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 10, minStock: 5, store: { name: 'Centro' } },
    ]);
    const cache = new MemoryCache();
    await cache.set(stockCacheKey(ORG, 's1', 'p1'), '777');
    const service = new StockService(prisma as never, cache, {} as never, new InMemoryEventBus());

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.byProduct('p1'));
    expect(rows[0]!.quantity).toBe(777);
  });

  it('miss: cae a Postgres y repuebla el cache', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 10, minStock: 5, store: { name: 'Centro' } },
    ]);
    const cache = new MemoryCache();
    const service = new StockService(prisma as never, cache, {} as never, new InMemoryEventBus());

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.byProduct('p1'));
    expect(rows[0]!.quantity).toBe(10);
    // Repuebla el cache con el valor de Postgres.
    expect(await cache.get(stockCacheKey(ORG, 's1', 'p1'))).toBe('10');
  });

  it('valor de cache corrupto (NaN): cae a Postgres', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 10, minStock: 5, store: { name: 'Centro' } },
    ]);
    const cache = new MemoryCache();
    await cache.set(stockCacheKey(ORG, 's1', 'p1'), 'no-es-un-número');
    const service = new StockService(prisma as never, cache, {} as never, new InMemoryEventBus());

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.byProduct('p1'));
    expect(rows[0]!.quantity).toBe(10);
  });
});

describe('alertTypeFor', () => {
  it('OUT_OF_STOCK si quantity <= 0', () => {
    expect(alertTypeFor(0, 5)).toBe('OUT_OF_STOCK');
    expect(alertTypeFor(-2, 5)).toBe('OUT_OF_STOCK');
  });

  it('LOW_STOCK si 0 < quantity <= minStock', () => {
    expect(alertTypeFor(5, 5)).toBe('LOW_STOCK');
    expect(alertTypeFor(1, 5)).toBe('LOW_STOCK');
  });

  it('null si quantity > minStock', () => {
    expect(alertTypeFor(6, 5)).toBeNull();
  });
});

// Mock de un tx con stockAlert para reevaluateAlert. `active` = alerta activa
// existente (o null). Registra las llamadas a create/update.
function makeAlertTx(active: { id: string; alertType: string } | null = null) {
  return {
    stockAlert: {
      findFirst: vi.fn(async () => active),
      create: vi.fn(async (_a?: unknown) => ({ id: 'new-alert' })),
      update: vi.fn(async (_a?: unknown) => ({ id: active?.id ?? 'x' })),
    },
  };
}

describe('StockService.reevaluateAlert', () => {
  const service = new StockService(
    {} as never,
    new MemoryCache(),
    {} as never,
    new InMemoryEventBus(),
  );

  it('crea alerta OUT_OF_STOCK si no había y el stock se agotó', async () => {
    const tx = makeAlertTx(null);
    await service.reevaluateAlert(tx as never, ORG, 'p1', 's1', 0, 5);
    expect(tx.stockAlert.create).toHaveBeenCalledOnce();
    const arg = tx.stockAlert.create.mock.calls[0]![0] as { data: { alertType: string } };
    expect(arg.data.alertType).toBe('OUT_OF_STOCK');
  });

  it('resuelve la alerta activa si el stock vuelve por encima del mínimo', async () => {
    const tx = makeAlertTx({ id: 'a1', alertType: 'LOW_STOCK' });
    await service.reevaluateAlert(tx as never, ORG, 'p1', 's1', 10, 5);
    const arg = tx.stockAlert.update.mock.calls[0]![0] as { data: { resolved: boolean } };
    expect(arg.data.resolved).toBe(true);
    expect(tx.stockAlert.create).not.toHaveBeenCalled();
  });

  it('actualiza el tipo si la alerta activa cambia (LOW_STOCK → OUT_OF_STOCK)', async () => {
    const tx = makeAlertTx({ id: 'a1', alertType: 'LOW_STOCK' });
    await service.reevaluateAlert(tx as never, ORG, 'p1', 's1', 0, 5);
    const arg = tx.stockAlert.update.mock.calls[0]![0] as { data: { alertType: string } };
    expect(arg.data.alertType).toBe('OUT_OF_STOCK');
    expect(tx.stockAlert.create).not.toHaveBeenCalled();
  });

  it('no-op si ya hay una alerta del mismo tipo (no duplica ni actualiza)', async () => {
    const tx = makeAlertTx({ id: 'a1', alertType: 'LOW_STOCK' });
    await service.reevaluateAlert(tx as never, ORG, 'p1', 's1', 3, 5);
    expect(tx.stockAlert.create).not.toHaveBeenCalled();
    expect(tx.stockAlert.update).not.toHaveBeenCalled();
  });
});

describe('StockService.alerts', () => {
  it('ordena por urgencia (OUT_OF_STOCK antes) y luego por antigüedad', async () => {
    const prisma = {
      stockAlert: {
        findMany: vi.fn(async () => [
          {
            id: 'a1',
            productId: 'p1',
            storeId: 's1',
            alertType: 'LOW_STOCK',
            resolved: false,
            createdAt: new Date('2026-05-28T08:00:00Z'),
            product: { name: 'Café' },
            store: { name: 'Centro' },
          },
          {
            id: 'a2',
            productId: 'p2',
            storeId: 's1',
            alertType: 'OUT_OF_STOCK',
            resolved: false,
            createdAt: new Date('2026-05-28T09:00:00Z'),
            product: { name: 'Té' },
            store: { name: 'Centro' },
          },
          {
            id: 'a3',
            productId: 'p3',
            storeId: 's1',
            alertType: 'OUT_OF_STOCK',
            resolved: false,
            createdAt: new Date('2026-05-28T07:00:00Z'),
            product: { name: 'Vape' },
            store: { name: 'Centro' },
          },
        ]),
      },
    };
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.alerts({}));

    // OUT_OF_STOCK primero (a3 más antigua, luego a2), después LOW_STOCK (a1).
    expect(rows.map((r) => r.id)).toEqual(['a3', 'a2', 'a1']);
  });
});

describe('StockService.setMin', () => {
  it('actualiza el mínimo y reevalúa la alerta en una tx', async () => {
    const tx = {
      stock: {
        upsert: vi.fn(async () => ({ quantity: 2, minStock: 5 })),
      },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (_a?: unknown) => ({ id: 'new-alert' })),
        update: vi.fn(async () => ({})),
      },
      $executeRaw: vi.fn(async () => 1),
    };
    const base = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      base as never,
      new InMemoryEventBus(),
    );

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.setMin('p1', 's1', 5),
    );

    // Subir el mínimo a 5 con quantity 2 → dispara LOW_STOCK.
    expect(tx.stockAlert.create).toHaveBeenCalledOnce();
    expect(res.minStock).toBe(5);
    expect(res.level).toBe('yellow');
  });
});

describe('StockService.adjust', () => {
  it('calcula el delta (newQuantity - actual) y aplica un movimiento ADJUSTMENT', async () => {
    // Actual 30 (del lock FOR UPDATE), newQuantity 50 → delta +20.
    const upsert = vi.fn(async () => ({ quantity: 50, minStock: 10 }));
    const movementCreate = vi.fn(async (_a?: unknown) => ({ id: 'mov-1' }));
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => [{ quantity: '30' }]),
      stock: {
        upsert,
        findFirstOrThrow: vi.fn(async () => ({ quantity: 50, minStock: 10 })),
      },
      stockMovement: { create: movementCreate },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'a' })),
        update: vi.fn(async () => ({})),
      },
    };
    const base = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      base as never,
      new InMemoryEventBus(),
    );

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.adjust({
        productId: 'p1',
        storeId: 's1',
        newQuantity: 50,
        reason: 'recuento',
        userId: 'user-1',
      }),
    );

    // El movimiento ADJUSTMENT lleva el delta (+20) y el motivo.
    const movArg = movementCreate.mock.calls[0]![0] as {
      data: { type: string; quantity: number; reason: string };
    };
    expect(movArg.data.type).toBe('ADJUSTMENT');
    expect(movArg.data.quantity).toBe(20);
    expect(movArg.data.reason).toBe('recuento');
    expect(res.quantity).toBe(50);
    expect(res.level).toBe('green');
  });

  it('sin fila de Stock previa: actual 0, delta = newQuantity', async () => {
    const movementCreate = vi.fn(async (_a?: unknown) => ({ id: 'mov-1' }));
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => []),
      stock: {
        upsert: vi.fn(async () => ({ quantity: 15, minStock: 0 })),
        findFirstOrThrow: vi.fn(async () => ({ quantity: 15, minStock: 0 })),
      },
      stockMovement: { create: movementCreate },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'a' })),
        update: vi.fn(async () => ({})),
      },
    };
    const base = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      base as never,
      new InMemoryEventBus(),
    );

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.adjust({
        productId: 'p1',
        storeId: 's1',
        newQuantity: 15,
        reason: 'alta inicial',
        userId: 'u1',
      }),
    );

    const movArg = movementCreate.mock.calls[0]![0] as { data: { quantity: number } };
    expect(movArg.data.quantity).toBe(15);
  });
});

describe('StockService.confirmInventoryCount', () => {
  it('aplica todas las líneas en UNA sola transacción con el delta por par (S-11)', async () => {
    const movementCreate = vi.fn(async (_a?: unknown) => ({ id: 'mov' }));
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      // Actual 10 en cada par (del lock FOR UPDATE).
      $queryRaw: vi.fn(async () => [{ quantity: '10' }]),
      stock: {
        upsert: vi.fn(async () => ({ quantity: 0, minStock: 0 })),
        findFirstOrThrow: vi.fn(async () => ({ quantity: 0, minStock: 0 })),
      },
      stockMovement: { create: movementCreate },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'a' })),
        update: vi.fn(async () => ({})),
      },
    };
    const base = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new StockService(
      {} as never,
      new MemoryCache(),
      base as never,
      new InMemoryEventBus(),
    );

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.confirmInventoryCount(
        {
          storeId: 's1',
          reason: 'recuento mensual',
          lines: [
            { productId: 'p1', countedQuantity: 12 },
            { productId: 'p2', countedQuantity: 8 },
          ],
        },
        'user-1',
      ),
    );

    // S-11: una ÚNICA transacción para todo el recuento (antes, una por línea).
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    // Un movimiento ADJUSTMENT por línea con el delta correcto (counted - 10).
    expect(movementCreate).toHaveBeenCalledTimes(2);
    const deltas = movementCreate.mock.calls.map(
      (c) => (c[0] as { data: { quantity: number } }).data.quantity,
    );
    expect(deltas).toEqual([2, -2]);
    expect(res.storeId).toBe('s1');
    expect(res.adjusted).toHaveLength(2);
  });
});

describe('StockService.movements', () => {
  it('aplica filtros (producto, tienda, fechas) y pagina, aislado por tenant', async () => {
    const prisma = {
      stockMovement: {
        findMany: vi.fn(async (_a?: unknown) => [{ id: 'm1' }]),
        count: vi.fn(async (_a?: unknown) => 1),
      },
    };
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.movements({
        productId: 'p1',
        storeId: 's1',
        from: new Date('2026-05-01T00:00:00Z'),
        to: new Date('2026-05-29T00:00:00Z'),
        page: 2,
        pageSize: 10,
      }),
    );

    expect(res.totalItems).toBe(1);
    expect(res.page).toBe(2);
    const arg = prisma.stockMovement.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; productId: string; storeId: string; createdAt: object };
      skip: number;
      take: number;
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.productId).toBe('p1');
    expect(arg.where.createdAt).toBeDefined();
    expect(arg.skip).toBe(10); // (page 2 - 1) * pageSize 10
    expect(arg.take).toBe(10);
  });

  it('SEC-09: acota pageSize a 100 aunque el cliente pida un valor enorme', async () => {
    const prisma = {
      stockMovement: {
        findMany: vi.fn(async (_a?: unknown) => []),
        count: vi.fn(async (_a?: unknown) => 0),
      },
    };
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.movements({ page: 1, pageSize: 100_000_000 }),
    );

    expect(res.pageSize).toBe(100);
    const arg = prisma.stockMovement.findMany.mock.calls[0]![0] as { take: number; skip: number };
    expect(arg.take).toBe(100);
    expect(arg.skip).toBe(0);
  });

  it('sin filtros de fecha no incluye createdAt en el where', async () => {
    const prisma = {
      stockMovement: {
        findMany: vi.fn(async (_a?: unknown) => []),
        count: vi.fn(async (_a?: unknown) => 0),
      },
    };
    const service = new StockService(
      prisma as never,
      new MemoryCache(),
      {} as never,
      new InMemoryEventBus(),
    );

    await tenantStorage.run({ organizationId: ORG }, () => service.movements({}));

    const arg = prisma.stockMovement.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where.createdAt).toBeUndefined();
  });
});

describe('StockService.expiringBatches', () => {
  type ExpiringWhere = {
    organizationId: string;
    quantity: { gt: number };
    expiryDate: { not: null; lte: Date };
    storeId?: string;
  };

  function makeBatchPrisma(rows: unknown[]) {
    return { stockBatch: { findMany: vi.fn(async (_a?: unknown) => rows) } };
  }

  it('mapea/clasifica los lotes y construye el where (tenant, stock>0, caducidad, tienda)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00Z'));
    try {
      const prisma = makeBatchPrisma([
        {
          id: 'b1',
          productId: 'p1',
          storeId: 's1',
          lotCode: 'L-OLD',
          expiryDate: new Date('2026-06-01'),
          quantity: 8,
          product: { name: 'Flores CBD' },
          store: { name: 'Centro' },
        },
        {
          id: 'b2',
          productId: 'p2',
          storeId: 's1',
          lotCode: 'L-SOON',
          expiryDate: new Date('2026-06-20'),
          quantity: 12,
          product: { name: 'Aceite CBD' },
          store: { name: 'Centro' },
        },
      ]);
      const service = new StockService(
        prisma as never,
        new MemoryCache(),
        {} as never,
        new InMemoryEventBus(),
      );

      const rows = await tenantStorage.run({ organizationId: ORG }, () =>
        service.expiringBatches({ storeId: 's1' }),
      );

      // Caducado: status expired y días negativos; enriquecido con nombres y cantidad.
      expect(rows[0]).toMatchObject({
        lotCode: 'L-OLD',
        status: 'expired',
        productName: 'Flores CBD',
        storeName: 'Centro',
        quantity: 8,
        expiryDate: '2026-06-01',
      });
      expect(rows[0]!.daysToExpiry).toBe(-7);
      // Por caducar dentro de la ventana por defecto (30 días).
      expect(rows[1]).toMatchObject({ lotCode: 'L-SOON', status: 'expiring' });
      expect(rows[1]!.daysToExpiry).toBe(12);

      const arg = prisma.stockBatch.findMany.mock.calls[0]![0] as { where: ExpiringWhere };
      expect(arg.where.organizationId).toBe(ORG);
      expect(arg.where.quantity).toEqual({ gt: 0 });
      expect(arg.where.expiryDate.not).toBeNull();
      expect(arg.where.storeId).toBe('s1');
      // cutoff = hoy (medianoche UTC) + 30 días.
      expect(arg.where.expiryDate.lte.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('respeta withinDays válido (acota la ventana) y omite storeId si no se pasa', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00Z'));
    try {
      const prisma = makeBatchPrisma([]);
      const service = new StockService(
        prisma as never,
        new MemoryCache(),
        {} as never,
        new InMemoryEventBus(),
      );

      await tenantStorage.run({ organizationId: ORG }, () =>
        service.expiringBatches({ withinDays: 10 }),
      );

      const arg = prisma.stockBatch.findMany.mock.calls[0]![0] as { where: ExpiringWhere };
      expect(arg.where.expiryDate.lte.toISOString()).toBe('2026-06-18T00:00:00.000Z');
      expect(arg.where.storeId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('withinDays inválido (negativo) cae al default de 30 días', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00Z'));
    try {
      const prisma = makeBatchPrisma([]);
      const service = new StockService(
        prisma as never,
        new MemoryCache(),
        {} as never,
        new InMemoryEventBus(),
      );

      await tenantStorage.run({ organizationId: ORG }, () =>
        service.expiringBatches({ withinDays: -5 }),
      );

      const arg = prisma.stockBatch.findMany.mock.calls[0]![0] as { where: ExpiringWhere };
      expect(arg.where.expiryDate.lte.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});
