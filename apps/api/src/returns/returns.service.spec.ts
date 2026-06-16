import { ForbiddenException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { MemoryCache } from '../cache/memory-cache.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { tenantStorage } from '../prisma/tenant-context.js';
import { StockService } from '../stock/stock.service.js';
import { computeReturnable, computeReturnLineTotal } from './returns.domain.js';
import { ReturnsService } from './returns.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('computeReturnLineTotal', () => {
  it('proporción del neto de la línea por la cantidad devuelta', () => {
    // SaleLine: neto 30 por 3 uds → unitario neto 10. Devolver 2 → 20.
    expect(computeReturnLineTotal(30, 3, 2)).toBeCloseTo(20, 2);
  });

  it('devolver la línea entera devuelve el neto completo', () => {
    expect(computeReturnLineTotal(18, 2, 2)).toBeCloseTo(18, 2);
  });

  it('redondea a 2 decimales', () => {
    // neto 10 por 3 uds → 3.3333... por unidad; devolver 1 → 3.33.
    expect(computeReturnLineTotal(10, 3, 1)).toBeCloseTo(3.33, 2);
  });

  it('saleLineQty 0 no divide por cero → 0', () => {
    expect(computeReturnLineTotal(10, 0, 1)).toBe(0);
  });
});

describe('computeReturnable', () => {
  it('vendido − ya devuelto', () => {
    expect(computeReturnable(5, 2)).toBeCloseTo(3, 2);
  });

  it('sin devoluciones previas: todo lo vendido', () => {
    expect(computeReturnable(4, 0)).toBeCloseTo(4, 2);
  });

  it('nunca negativo', () => {
    expect(computeReturnable(2, 5)).toBe(0);
  });
});

// Mock del cliente Prisma extendido (lecturas, p.ej. list).
function makePrisma() {
  return {
    return: {
      findMany: vi.fn(async (_a?: unknown): Promise<unknown[]> => []),
    },
  };
}

// Mock del cliente base: su $transaction recibe un tx con sale.findFirst,
// returnLine.findMany y return.create. Configurable por test.
function makeBase(
  opts: {
    sale?: unknown;
    previous?: Array<{ saleLineId: string; qty: number }>;
  } = {},
) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    // El registro VeriFactu rectificativo lee el NIF de la org dentro de la tx (SEC-07).
    organization: {
      findFirst: vi.fn(async () => ({ nif: 'B11111111' })),
    },
    sale: {
      findFirst: vi.fn(async () => opts.sale ?? null),
    },
    returnLine: {
      findMany: vi.fn(async () => opts.previous ?? []),
    },
    // applyBatchedReturn (#137) consulta tracksBatch del producto; los productos de
    // estos tests no llevan lote → reingreso sin lote (flujo de siempre).
    product: {
      findFirst: vi.fn(async () => ({ tracksBatch: false })),
    },
    return: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-return',
        ...data,
        lines: (data.lines as { create: unknown[] }).create,
      })),
    },
    // applyMovement (tras return.create) repone el stock de cada línea devuelta
    // y reevalúa la alerta (#29).
    stock: {
      upsert: vi.fn(async () => ({ quantity: 102, minStock: 0 })),
    },
    stockMovement: {
      create: vi.fn(async () => ({ id: 'mov-1' })),
    },
    stockAlert: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'alert-1' })),
      update: vi.fn(async () => ({ id: 'alert-1' })),
    },
  };
  return {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

// Mock de VerifactuService: createRecordInTx (en-tx) + enqueueSend (tras commit).
// Tipamos los parámetros para poder inspeccionar mock.calls[n][2] (el input).
function makeVerifactu() {
  return {
    createRecordInTx: vi.fn(async (_tx: unknown, _org: string, _input: unknown) => ({
      id: 'vf',
      hash: 'h',
      qrData: 'q',
    })),
    enqueueSend: vi.fn(async (_id: string, _org: string) => undefined),
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  base: unknown,
  verifactu: ReturnType<typeof makeVerifactu> = makeVerifactu(),
) {
  return new ReturnsService(
    prisma as never,
    base as never,
    new StockService({} as never, new MemoryCache(), {} as never, new InMemoryEventBus()),
    verifactu as never,
  );
}

// Venta de ejemplo con dos líneas (helper para los tests de create).
function sampleSale() {
  return {
    id: 'sale-1',
    storeId: 'store-1',
    status: 'COMPLETED',
    ticketNumber: 'T01-000001',
    lines: [
      { id: 'sl-1', productId: 'p1', qty: 3, lineTotal: 30 },
      { id: 'sl-2', productId: 'p2', qty: 2, lineTotal: 18 },
    ],
  };
}

describe('ReturnsService.create', () => {
  it('lanza 404 si la venta no existe', async () => {
    const base = makeBase({ sale: null });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'nope', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 400 si la venta está anulada (VOIDED)', async () => {
    const base = makeBase({ sale: { ...sampleSale(), status: 'VOIDED' } });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(/anulada/);
  });

  it('lanza 400 si la línea no pertenece a la venta', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'ajena', qty: 1 }] },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(/no pertenece a la venta/);
  });

  it('lanza 400 si se devuelve más de lo vendido', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        // sl-1 vendió 3, pedimos 4.
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 4 }] },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);
  });

  it('con devolución previa el disponible baja → exceso lanza 400', async () => {
    // sl-1 vendió 3, ya se devolvieron 2 → disponible 1. Pedir 2 → error.
    const base = makeBase({ sale: sampleSale(), previous: [{ saleLineId: 'sl-1', qty: 2 }] });
    const service = makeService(makePrisma(), base);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 2 }] },
          'user-1',
          'ADMIN',
        ),
      ),
    ).rejects.toThrow(/más de lo vendido/);
  });

  it('éxito: crea Return con líneas, total y organizationId correctos', async () => {
    const base = makeBase({ sale: sampleSale() });
    const service = makeService(makePrisma(), base);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        {
          saleId: 'sale-1',
          reason: 'producto defectuoso',
          lines: [{ saleLineId: 'sl-1', qty: 2 }],
        },
        'user-1',
        'ADMIN',
      ),
    )) as unknown as {
      organizationId: string;
      storeId: string;
      userId: string;
      reason: string;
      total: number;
      lines: Array<{ organizationId: string; productId: string; qty: number; lineTotal: number }>;
    };

    expect(base.$transaction).toHaveBeenCalledOnce();
    expect(base.__tx.return.create).toHaveBeenCalledOnce();
    expect(result.organizationId).toBe(ORG);
    expect(result.storeId).toBe('store-1');
    expect(result.userId).toBe('user-1');
    expect(result.reason).toBe('producto defectuoso');
    // sl-1: neto 30 por 3 uds → 10/ud. Devolver 2 → 20.
    expect(result.total).toBeCloseTo(20, 2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.organizationId).toBe(ORG);
    expect(result.lines[0]!.productId).toBe('p1');
    expect(result.lines[0]!.lineTotal).toBeCloseTo(20, 2);
  });

  it('SEC-07: genera un registro VeriFactu RECTIFICATION (abono, importe negativo) en la misma tx', async () => {
    const base = makeBase({ sale: sampleSale() });
    const verifactu = makeVerifactu();
    const service = makeService(makePrisma(), base, verifactu);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        { saleId: 'sale-1', reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 2 }] },
        'user-1',
        'ADMIN',
      ),
    );

    expect(verifactu.createRecordInTx).toHaveBeenCalledOnce();
    const input = verifactu.createRecordInTx.mock.calls[0]![2] as {
      type: string;
      returnId: string;
      payload: { invoiceNumber: string; total: number; type: string };
    };
    expect(input.type).toBe('RECTIFICATION');
    expect(input.returnId).toBe('new-return');
    expect(input.payload.invoiceNumber).toBe('T01-000001'); // referencia el ticket original
    expect(input.payload.type).toBe('RECTIFICATION');
    // sl-1: neto 30/3 uds → 10/ud; devolver 2 → 20 → abono -20.
    expect(input.payload.total).toBeCloseTo(-20, 2);
    // El envío a la AEAT se encola tras commit (best-effort, reintentable).
    expect(verifactu.enqueueSend).toHaveBeenCalledWith('vf', ORG);
  });

  it('éxito con devolución previa parcial: permite devolver el resto disponible', async () => {
    // sl-1 vendió 3, ya devueltos 2 → disponible 1. Devolver 1 → OK, total 10.
    const base = makeBase({ sale: sampleSale(), previous: [{ saleLineId: 'sl-1', qty: 2 }] });
    const service = makeService(makePrisma(), base);

    const result = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        { saleId: 'sale-1', reason: 'resto', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
        'user-1',
        'ADMIN',
      ),
    )) as unknown as { total: number };
    expect(result.total).toBeCloseTo(10, 2);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = makeService(makePrisma(), makeBase());
    await expect(
      service.create(
        { saleId: 'sale-1', reason: 'x', lines: [{ saleLineId: 'sl-1', qty: 1 }] },
        'user-1',
        'ADMIN',
      ),
    ).rejects.toThrow();
  });
});

describe('ReturnsService.list', () => {
  it('filtra por saleId y organizationId del tenant', async () => {
    const prisma = makePrisma();
    prisma.return.findMany = vi.fn(async () => [{ id: 'r1' }]);
    const service = makeService(prisma, makeBase());

    const res = await tenantStorage.run({ organizationId: ORG }, () => service.list('sale-1'));

    const arg = prisma.return.findMany.mock.calls[0]![0] as {
      where: { saleId: string; organizationId: string };
    };
    expect(arg.where.saleId).toBe('sale-1');
    expect(arg.where.organizationId).toBe(ORG);
    expect(res).toHaveLength(1);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = makeService(makePrisma(), makeBase());
    await expect(service.list('sale-1')).rejects.toThrow();
  });
});

describe('ReturnsService.createBlind', () => {
  const STORE = '22222222-2222-2222-2222-222222222222';
  const PROD = '33333333-3333-3333-3333-333333333333';

  // prisma con user (PIN) y product (precio). `pinHash` es el hash del PIN dado.
  function makeBlindPrisma(opts: {
    pinHash?: string | null;
    price?: number | null;
    authorizerId?: string;
  }) {
    const authorizerId = opts.authorizerId ?? 'mgr-1';
    return {
      user: {
        // Respeta el filtro `id: { not: userId }` del resolveAuthorizer para que
        // el test del bypass «cuatro ojos» (iniciador == único autorizador) sea
        // fiel: si el iniciador queda excluido, findMany devuelve [].
        findMany: vi.fn(async (args?: { where?: { id?: { not?: string } } }) => {
          const excluded = args?.where?.id?.not;
          if (excluded !== undefined && excluded === authorizerId) {
            return [];
          }
          return opts.pinHash === undefined
            ? [{ id: authorizerId, pinHash: null }]
            : [{ id: authorizerId, pinHash: opts.pinHash }];
        }),
      },
      product: {
        findMany: vi.fn(async () =>
          opts.price == null ? [] : [{ id: PROD, salePrice: String(opts.price) }],
        ),
      },
    };
  }

  function makeBlindBase() {
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      organization: {
        findFirst: vi.fn(async () => ({ nif: 'B11111111' })),
      },
      return: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'blind-1',
          ...data,
          lines: (data.lines as { create: unknown[] }).create,
        })),
      },
      stock: { upsert: vi.fn(async (_a?: unknown) => ({ quantity: 5, minStock: 0 })) },
      stockMovement: { create: vi.fn(async (_a?: unknown) => ({ id: 'mov-1' })) },
      stockAlert: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (_a?: unknown) => ({ id: 'a' })),
        update: vi.fn(async (_a?: unknown) => ({})),
      },
    };
    return {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    };
  }

  function service(prisma: unknown, base: unknown) {
    return new ReturnsService(
      prisma as never,
      base as never,
      new StockService(prisma as never, new MemoryCache(), base as never, new InMemoryEventBus()),
      makeVerifactu() as never,
    );
  }

  const dto = {
    storeId: STORE,
    reason: 'producto defectuoso',
    managerPin: '4321',
    lines: [{ productId: PROD, qty: 2 }],
  };

  it('403 si el PIN no coincide con ningún MANAGER/ADMIN', async () => {
    const otherHash = await bcrypt.hash('9999', 10);
    const svc = service(makeBlindPrisma({ pinHash: otherHash, price: 10 }), makeBlindBase());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => svc.createBlind(dto, 'clerk-1', 'ADMIN')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('SEC-19: bloquea (lockout) tras 5 PINs incorrectos del mismo usuario', async () => {
    const otherHash = await bcrypt.hash('9999', 10);
    const svc = service(makeBlindPrisma({ pinHash: otherHash, price: 10 }), makeBlindBase());
    // 5 intentos con PIN incorrecto → rechazo normal por PIN inválido.
    for (let i = 0; i < 5; i++) {
      await expect(
        tenantStorage.run({ organizationId: ORG }, () => svc.createBlind(dto, 'clerk-1', 'ADMIN')),
      ).rejects.toThrow(/PIN de autorización inválido/);
    }
    // El 6º queda bloqueado por el lockout (mensaje distinto), antes de comparar PIN.
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => svc.createBlind(dto, 'clerk-1', 'ADMIN')),
    ).rejects.toThrow(/Demasiados intentos/);
  });

  it('PIN válido: crea la devolución con importe = precio actual × qty y autorizador', async () => {
    const pinHash = await bcrypt.hash('4321', 10);
    const base = makeBlindBase();
    const svc = service(makeBlindPrisma({ pinHash, price: 10 }), base);

    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      svc.createBlind(dto, 'clerk-1', 'ADMIN'),
    )) as unknown as { authorizedBy: string; total: number; saleId?: string | null };

    // precio 10 × qty 2 = 20.
    expect(res.total).toBeCloseTo(20, 2);
    expect(res.authorizedBy).toBe('mgr-1');
    const createArg = base.__tx.return.create.mock.calls[0]![0] as {
      data: { saleId?: string; userId: string };
    };
    expect(createArg.data.saleId).toBeUndefined(); // sin ticket
    expect(createArg.data.userId).toBe('clerk-1'); // operario que la inició
  });

  it('cuatro ojos: el iniciador NO puede auto-autorizar con su propio PIN', async () => {
    // El único MANAGER/ADMIN con PIN es el propio iniciador. Al excluirlo del
    // where (id: { not: userId }), no queda ningún autorizador → 403.
    const pinHash = await bcrypt.hash('4321', 10);
    const svc = service(
      makeBlindPrisma({ pinHash, price: 10, authorizerId: 'self-mgr' }),
      makeBlindBase(),
    );
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        // initiator === único autorizador del tenant
        svc.createBlind(dto, 'self-mgr', 'MANAGER'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cuatro ojos: pasa el userId iniciador como exclusión al resolver', async () => {
    const pinHash = await bcrypt.hash('4321', 10);
    const prisma = makeBlindPrisma({ pinHash, price: 10 });
    const svc = service(prisma, makeBlindBase());
    await tenantStorage.run({ organizationId: ORG }, () =>
      svc.createBlind(dto, 'clerk-1', 'ADMIN'),
    );
    const whereArg = prisma.user.findMany.mock.calls[0]![0] as {
      where: { id?: { not?: string } };
    };
    expect(whereArg.where.id).toEqual({ not: 'clerk-1' });
  });

  it('400 si un producto no pertenece al tenant', async () => {
    const pinHash = await bcrypt.hash('4321', 10);
    const svc = service(makeBlindPrisma({ pinHash, price: null }), makeBlindBase());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => svc.createBlind(dto, 'clerk-1', 'ADMIN')),
    ).rejects.toThrow(/no encontrado/);
  });

  it('repone el stock del producto (movimiento RETURN)', async () => {
    const pinHash = await bcrypt.hash('4321', 10);
    const base = makeBlindBase();
    const svc = service(makeBlindPrisma({ pinHash, price: 10 }), base);
    await tenantStorage.run({ organizationId: ORG }, () =>
      svc.createBlind(dto, 'clerk-1', 'ADMIN'),
    );
    const mv = base.__tx.stockMovement.create.mock.calls[0]![0] as {
      data: { type: string; quantity: number };
    };
    expect(mv.data.type).toBe('RETURN');
    expect(mv.data.quantity).toBe(2);
  });
});
