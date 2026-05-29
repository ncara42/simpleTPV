import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { SandboxVerifactuProvider, type VerifactuProvider } from './verifactu.provider.js';
import { VerifactuService } from './verifactu.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

const payload = {
  nif: 'B11111111',
  invoiceNumber: 'T01-000001',
  date: '2026-05-28T10:00:00.000Z',
  total: 12.5,
  type: 'INVOICE' as const,
};

// base.$transaction implementa recordFor (lee el "last" de la cadena + create).
function makeBase(opts: { last?: { hash: string } | null } = {}) {
  const created = { id: 'vf1', hash: '', qrData: 'qr', payload, status: 'PENDING', attempts: 0 };
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    verifactuRecord: {
      findFirst: vi.fn(async () => opts.last ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.hash = data.hash as string;
        return { ...created, ...data };
      }),
    },
  };
  return {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

// El cliente extendido (prisma) implementa processRecord (findFirst por id +
// updateMany) y list/retry. `record` es lo que devuelve findFirst en processRecord.
function makePrisma(record?: unknown) {
  const updateMany = vi.fn(async (_a?: unknown) => ({ count: 1 }));
  const def = { id: 'vf1', status: 'PENDING', attempts: 0, hash: 'h', payload, qrData: 'q' };
  return {
    verifactuRecord: {
      findMany: vi.fn(async (_a?: unknown) => [{ id: 'vf1', status: 'PENDING' }]),
      findFirst: vi.fn(async (_a?: unknown) => record ?? def),
      updateMany,
    },
  };
}

function makeService(
  base: ReturnType<typeof makeBase>,
  provider?: VerifactuProvider,
  record?: unknown,
) {
  const prisma = makePrisma(record);
  const svc = new VerifactuService(
    prisma as never,
    base as never,
    provider ?? new SandboxVerifactuProvider(),
  );
  // Sin REDIS_URL en tests → no hay cola; processRecord corre síncrono.
  svc.onModuleInit();
  return { svc, prisma };
}

describe('VerifactuService.recordFor', () => {
  it('crea el registro encadenado (previousHash = hash anterior) y lo procesa', async () => {
    const base = makeBase({ last: { hash: 'hash-anterior' } });
    const { svc, prisma } = makeService(base);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      svc.recordFor({ type: 'INVOICE', saleId: 's1', payload }),
    );

    expect(res.hash).toMatch(/^[0-9a-f]{64}$/);
    const createArg = base.__tx.verifactuRecord.create.mock.calls[0]![0] as {
      data: { previousHash: string | null };
    };
    expect(createArg.data.previousHash).toBe('hash-anterior');
    // Sin cola, processRecord marcó el registro como SENT (sandbox OK).
    const upd = prisma.verifactuRecord.updateMany.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === 'SENT',
    );
    expect(upd).toBeDefined();
  });

  it('primer registro del tenant: previousHash null', async () => {
    const base = makeBase({ last: null });
    const { svc } = makeService(base);
    await tenantStorage.run({ organizationId: ORG }, () =>
      svc.recordFor({ type: 'INVOICE', saleId: 's1', payload }),
    );
    const createArg = base.__tx.verifactuRecord.create.mock.calls[0]![0] as {
      data: { previousHash: string | null };
    };
    expect(createArg.data.previousHash).toBeNull();
  });
});

describe('VerifactuService.processRecord', () => {
  it('proveedor OK → SENT', async () => {
    const provider: VerifactuProvider = { send: async () => ({ ok: true, csv: 'CSV' }) };
    const { svc, prisma } = makeService(makeBase(), provider, {
      id: 'vf1',
      status: 'PENDING',
      attempts: 0,
      hash: 'h',
      payload,
      qrData: 'q',
    });
    await svc.processRecord('vf1', ORG);
    const upd = prisma.verifactuRecord.updateMany.mock.calls[0]![0] as { data: { status: string } };
    expect(upd.data.status).toBe('SENT');
  });

  it('proveedor KO con intentos restantes → lanza (para reintentar)', async () => {
    const provider: VerifactuProvider = { send: async () => ({ ok: false, error: 'rechazado' }) };
    const { svc } = makeService(makeBase(), provider, {
      id: 'vf1',
      status: 'PENDING',
      attempts: 0,
      hash: 'h',
      payload,
      qrData: 'q',
    });
    await expect(svc.processRecord('vf1', ORG)).rejects.toThrow(/rechazado/);
  });

  it('proveedor KO en el último intento → FAILED sin lanzar', async () => {
    const provider: VerifactuProvider = { send: async () => ({ ok: false, error: 'rechazado' }) };
    const { svc, prisma } = makeService(makeBase(), provider, {
      id: 'vf1',
      status: 'PENDING',
      attempts: 4,
      hash: 'h',
      payload,
      qrData: 'q',
    });
    await svc.processRecord('vf1', ORG); // no lanza (attempts 4→5 = MAX)
    const upd = prisma.verifactuRecord.updateMany.mock.calls[0]![0] as {
      data: { status?: string };
    };
    expect(upd.data.status).toBe('FAILED');
  });
});

describe('SandboxVerifactuProvider', () => {
  it('responde OK con un CSV simulado', async () => {
    const res = await new SandboxVerifactuProvider().send(payload, 'abcdef0123456789');
    expect(res.ok).toBe(true);
    expect(res.csv).toContain('SANDBOX-');
  });
});
