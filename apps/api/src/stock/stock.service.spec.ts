import { describe, expect, it, vi } from 'vitest';

import { StockService } from './stock.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// Mock del cliente transaccional (lo que applyMovement recibe como `tx`). Solo
// declaramos stock.upsert y stockMovement.create, que es lo que toca.
function makeTx(resultingQuantity = 0) {
  return {
    stock: {
      upsert: vi.fn(async (_a?: unknown) => ({ quantity: resultingQuantity })),
    },
    stockMovement: {
      create: vi.fn(async (_a?: unknown) => ({ id: 'mov-1' })),
    },
  };
}

describe('StockService.applyMovement', () => {
  it('salida (venta): upsert con increment negativo + movimiento SALE', async () => {
    const tx = makeTx(98);
    const service = new StockService();

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

  it('entrada (reposición): increment positivo + movimiento RETURN', async () => {
    const tx = makeTx(102);
    const service = new StockService();

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
    const service = new StockService();

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
});
