import { describe, expect, it, vi } from 'vitest';

import { MemoryCache } from '../cache/memory-cache.js';
import { tenantStorage } from '../prisma/tenant-context.js';
import { alertTypeFor, stockCacheKey, stockLevel, StockService } from './stock.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// Mock del cliente transaccional (lo que applyMovement recibe como `tx`). Solo
// declaramos stock.upsert y stockMovement.create, que es lo que toca.
function makeTx(resultingQuantity = 0, minStock = 0) {
  return {
    stock: {
      upsert: vi.fn(async (_a?: unknown) => ({ quantity: resultingQuantity, minStock })),
    },
    stockMovement: {
      create: vi.fn(async (_a?: unknown) => ({ id: 'mov-1' })),
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
    const service = new StockService({} as never, new MemoryCache(), {} as never);

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
    const service = new StockService({} as never, new MemoryCache(), {} as never);

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
    const service = new StockService({} as never, new MemoryCache(), {} as never);

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
    const service = new StockService({} as never, cache, {} as never);

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
function makeQueryPrisma(rows: unknown[]) {
  return {
    stock: {
      findMany: vi.fn(async (_a?: unknown) => rows),
    },
  };
}

describe('StockService.byStore', () => {
  it('mapea cada fila a quantity/minStock/nivel y exige tenant', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 0, minStock: 5, product: { name: 'Café' } },
      { productId: 'p2', storeId: 's1', quantity: 8, minStock: 5, product: { name: 'Té' } },
    ]);
    const service = new StockService(prisma as never, new MemoryCache(), {} as never);

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.byStore('s1'));

    expect(rows[0]).toMatchObject({ productId: 'p1', level: 'red', quantity: 0 });
    expect(rows[1]).toMatchObject({ productId: 'p2', level: 'green', quantity: 8 });
    // El where lleva organizationId explícito (defensa en profundidad).
    const arg = prisma.stock.findMany.mock.calls[0]![0] as {
      where: { storeId: string; organizationId: string };
    };
    expect(arg.where.organizationId).toBe(ORG);
  });
});

describe('StockService.global', () => {
  it('agrega por producto el stock de cada tienda y el total', async () => {
    const prisma = makeQueryPrisma([
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
    ]);
    const service = new StockService(prisma as never, new MemoryCache(), {} as never);

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.global());

    expect(rows).toHaveLength(1);
    expect(rows[0]!.total).toBe(13);
    expect(rows[0]!.stores).toHaveLength(2);
    expect(rows[0]!.stores.find((s) => s.storeId === 's2')!.level).toBe('yellow');
  });
});

describe('StockService.byProduct (cache)', () => {
  it('hit: devuelve la quantity del cache, no la de Postgres', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 10, minStock: 5, store: { name: 'Centro' } },
    ]);
    const cache = new MemoryCache();
    await cache.set(stockCacheKey(ORG, 's1', 'p1'), '777');
    const service = new StockService(prisma as never, cache, {} as never);

    const rows = await tenantStorage.run({ organizationId: ORG }, () => service.byProduct('p1'));
    expect(rows[0]!.quantity).toBe(777);
  });

  it('miss: cae a Postgres y repuebla el cache', async () => {
    const prisma = makeQueryPrisma([
      { productId: 'p1', storeId: 's1', quantity: 10, minStock: 5, store: { name: 'Centro' } },
    ]);
    const cache = new MemoryCache();
    const service = new StockService(prisma as never, cache, {} as never);

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
    const service = new StockService(prisma as never, cache, {} as never);

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
  const service = new StockService({} as never, new MemoryCache(), {} as never);

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
    const service = new StockService(prisma as never, new MemoryCache(), {} as never);

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
    const service = new StockService({} as never, new MemoryCache(), base as never);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.setMin('p1', 's1', 5),
    );

    // Subir el mínimo a 5 con quantity 2 → dispara LOW_STOCK.
    expect(tx.stockAlert.create).toHaveBeenCalledOnce();
    expect(res.minStock).toBe(5);
    expect(res.level).toBe('yellow');
  });
});
