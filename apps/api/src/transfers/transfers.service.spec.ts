import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import type { StockService } from '../stock/stock.service.js';
import { computeDiscrepancy, TransfersService } from './transfers.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE_A = '22222222-2222-2222-2222-222222222222';
const STORE_B = '33333333-3333-3333-3333-333333333333';

describe('computeDiscrepancy', () => {
  it('recibido == enviado → 0', () => {
    expect(computeDiscrepancy(10, 10)).toBe(0);
  });

  it('recibido < enviado → negativo (merma en tránsito)', () => {
    expect(computeDiscrepancy(10, 7)).toBe(-3);
  });

  it('recibido > enviado → positivo (exceso)', () => {
    expect(computeDiscrepancy(10, 12)).toBe(2);
  });

  it('redondea a 3 decimales (granel)', () => {
    expect(computeDiscrepancy(1.111, 1.0)).toBeCloseTo(-0.111, 3);
  });
});

// Mock del cliente extendido para create (store.findMany + transfer.create).
function makePrisma(storesFound: string[]) {
  return {
    store: {
      findMany: vi.fn(async () => storesFound.map((id) => ({ id }))),
    },
    transfer: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        ...data,
      })),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TransfersService(prisma as never, {} as never, {} as never);
}

describe('TransfersService.create', () => {
  it('rechaza origen == destino', async () => {
    const service = makeService(makePrisma([STORE_A]));
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          {
            originStoreId: STORE_A,
            destStoreId: STORE_A,
            lines: [{ productId: 'p1', quantitySent: 1 }],
          },
          'user-1',
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza si una tienda no pertenece al tenant (solo 1 encontrada)', async () => {
    const service = makeService(makePrisma([STORE_A]));
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create(
          {
            originStoreId: STORE_A,
            destStoreId: STORE_B,
            lines: [{ productId: 'p1', quantitySent: 1 }],
          },
          'user-1',
        ),
      ),
    ).rejects.toThrow(/no pertenecen/);
  });

  it('crea el traspaso en DRAFT con sus líneas', async () => {
    const prisma = makePrisma([STORE_A, STORE_B]);
    const service = makeService(prisma);
    const res = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.create(
        {
          originStoreId: STORE_A,
          destStoreId: STORE_B,
          notes: 'reposición semanal',
          lines: [{ productId: 'p1', quantitySent: 5 }],
        },
        'user-1',
      ),
    )) as unknown as { organizationId: string; createdBy: string };
    expect(res.organizationId).toBe(ORG);
    expect(res.createdBy).toBe('user-1');
    const arg = prisma.transfer.create.mock.calls[0]![0] as {
      data: { originStoreId: string; lines: { create: unknown[] } };
    };
    expect(arg.data.originStoreId).toBe(STORE_A);
    expect(arg.data.lines.create).toHaveLength(1);
  });
});

// StockService mockeado: applyMovement registra las llamadas y no toca BD.
function makeStock() {
  return { applyMovement: vi.fn(async () => 0) } as unknown as StockService & {
    applyMovement: ReturnType<typeof vi.fn>;
  };
}

// tx con transfer/transferLine. `transfer` es el estado que devuelve findFirst;
// updateMany devuelve el count configurable (1 = transición OK, 0 = carrera).
function makeTx(transfer: unknown, updateCount = 1) {
  return {
    $executeRaw: vi.fn(async () => 1),
    transfer: {
      findFirst: vi.fn(async () => transfer),
      updateMany: vi.fn(async () => ({ count: updateCount })),
      findFirstOrThrow: vi.fn(async () => ({ ...(transfer as object), status: 'TRANSITIONED' })),
    },
    transferLine: {
      update: vi.fn(async (_a?: unknown) => ({})),
    },
  };
}

function withBase(tx: ReturnType<typeof makeTx>, stock: ReturnType<typeof makeStock>) {
  const base = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
  return new TransfersService({} as never, base as never, stock);
}

describe('TransfersService.send', () => {
  it('404 si no existe', async () => {
    const tx = makeTx(null);
    const service = withBase(tx, makeStock());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.send('x', 'u')),
    ).rejects.toThrow(NotFoundException);
  });

  it('409 si no está en DRAFT', async () => {
    const tx = makeTx({ id: 't1', status: 'SENT', originStoreId: STORE_A, lines: [] });
    const service = withBase(tx, makeStock());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.send('t1', 'u')),
    ).rejects.toThrow(ConflictException);
  });

  it('DRAFT → SENT: aplica TRANSFER_OUT negativo por cada línea', async () => {
    const tx = makeTx({
      id: 't1',
      status: 'DRAFT',
      originStoreId: STORE_A,
      lines: [{ id: 'l1', productId: 'p1', quantitySent: 30 }],
    });
    const stock = makeStock();
    const service = withBase(tx, stock);

    await tenantStorage.run({ organizationId: ORG }, () => service.send('t1', 'u'));

    const mv = stock.applyMovement.mock.calls[0]![1] as {
      type: string;
      quantity: number;
      storeId: string;
    };
    expect(mv.type).toBe('TRANSFER_OUT');
    expect(mv.quantity).toBe(-30);
    expect(mv.storeId).toBe(STORE_A);
  });

  it('409 si updateMany afecta 0 filas (carrera)', async () => {
    const tx = makeTx({ id: 't1', status: 'DRAFT', originStoreId: STORE_A, lines: [] }, 0);
    const service = withBase(tx, makeStock());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.send('t1', 'u')),
    ).rejects.toThrow(/ya fue enviado/);
  });
});

describe('TransfersService.receive', () => {
  const sent = {
    id: 't1',
    status: 'SENT',
    destStoreId: STORE_B,
    lines: [{ id: 'l1', productId: 'p1', quantitySent: 30 }],
  };

  it('409 si no está en SENT', async () => {
    const tx = makeTx({ ...sent, status: 'DRAFT' });
    const service = withBase(tx, makeStock());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.receive('t1', { lines: [{ lineId: 'l1', quantityReceived: 30 }] }, 'u'),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('400 si una línea del dto no pertenece al traspaso', async () => {
    const tx = makeTx(sent);
    const service = withBase(tx, makeStock());
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.receive('t1', { lines: [{ lineId: 'ajena', quantityReceived: 30 }] }, 'u'),
      ),
    ).rejects.toThrow(/no pertenece/);
  });

  it('SENT → RECEIVED: registra discrepancia y aplica TRANSFER_IN por lo recibido', async () => {
    const tx = makeTx(sent);
    const stock = makeStock();
    const service = withBase(tx, stock);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.receive('t1', { lines: [{ lineId: 'l1', quantityReceived: 28 }] }, 'u'),
    );

    // La línea se actualiza con discrepancy -2 (28 - 30).
    const lineArg = tx.transferLine.update.mock.calls[0]![0] as {
      data: { quantityReceived: number; discrepancy: number };
    };
    expect(lineArg.data.quantityReceived).toBe(28);
    expect(lineArg.data.discrepancy).toBe(-2);
    // Movimiento TRANSFER_IN al destino por lo recibido (28).
    const mv = stock.applyMovement.mock.calls[0]![1] as {
      type: string;
      quantity: number;
      storeId: string;
    };
    expect(mv.type).toBe('TRANSFER_IN');
    expect(mv.quantity).toBe(28);
    expect(mv.storeId).toBe(STORE_B);
  });

  it('no aplica TRANSFER_IN si se recibe 0', async () => {
    const tx = makeTx(sent);
    const stock = makeStock();
    const service = withBase(tx, stock);
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.receive('t1', { lines: [{ lineId: 'l1', quantityReceived: 0 }] }, 'u'),
    );
    expect(stock.applyMovement).not.toHaveBeenCalled();
  });
});

// Para close/list/get el servicio usa el cliente extendido (no withTenantTx).
function makeExtendedPrisma(transfer: unknown) {
  return {
    transfer: {
      findFirst: vi.fn(async () => transfer),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async () => ({ ...(transfer as object), status: 'CLOSED' })),
      findMany: vi.fn(async (_a?: unknown) => [transfer]),
    },
  };
}

describe('TransfersService.close', () => {
  it('409 si no está en RECEIVED', async () => {
    const prisma = makeExtendedPrisma({ id: 't1', status: 'SENT' });
    const service = new TransfersService(prisma as never, {} as never, {} as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.close('t1')),
    ).rejects.toThrow(ConflictException);
  });

  it('RECEIVED → CLOSED', async () => {
    const prisma = makeExtendedPrisma({ id: 't1', status: 'RECEIVED' });
    const service = new TransfersService(prisma as never, {} as never, {} as never);
    const res = (await tenantStorage.run({ organizationId: ORG }, () => service.close('t1'))) as {
      status: string;
    };
    expect(res.status).toBe('CLOSED');
  });
});

describe('TransfersService.list/get', () => {
  it('list filtra por estado y organizationId', async () => {
    const prisma = makeExtendedPrisma({ id: 't1', status: 'SENT' });
    const service = new TransfersService(prisma as never, {} as never, {} as never);
    await tenantStorage.run({ organizationId: ORG }, () => service.list('SENT'));
    const arg = prisma.transfer.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; status?: string };
    };
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.status).toBe('SENT');
  });

  it('get lanza 404 si no existe en el tenant', async () => {
    const prisma = makeExtendedPrisma(null);
    const service = new TransfersService(prisma as never, {} as never, {} as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.get('x')),
    ).rejects.toThrow(NotFoundException);
  });
});
