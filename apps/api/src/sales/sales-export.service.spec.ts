import { afterEach, describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { SalesExportService } from './sales-export.service.js';

// Stub de bullmq: Queue/Worker no abren conexiones reales a Redis. Capturamos las
// `connection` con las que se construyen para verificar el endurecimiento TLS y la
// retención de jobs (#118) sin necesitar un Redis vivo.
const queueAdd = vi.fn(async (..._args: unknown[]) => undefined);
const queueClose = vi.fn(async () => undefined);
const workerClose = vi.fn(async () => undefined);
const ctorConnections: unknown[] = [];
vi.mock('bullmq', () => ({
  Queue: class {
    add = queueAdd;
    close = queueClose;
    constructor(_name: string, opts: { connection: unknown }) {
      ctorConnections.push(opts.connection);
    }
  },
  Worker: class {
    close = workerClose;
    on = vi.fn();
    constructor() {}
  },
}));

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

function makePrisma() {
  return {
    salesExport: {
      create: vi.fn(async (_a?: unknown): Promise<{ id: string }> => ({ id: 'exp-1' })),
      findFirst: vi.fn(async (_a?: unknown): Promise<unknown> => ({ status: 'COMPLETED' })),
      updateMany: vi.fn(async (_a?: unknown): Promise<{ count: number }> => ({ count: 1 })),
    },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  generateExportCsv = vi.fn(async () => ({ csv: 'h\nr1\nr2', rowCount: 2 })),
  generateAccountingCsv = vi.fn(async () => ({ csv: 'acc\nr1', rowCount: 1 })),
) {
  const sales = { generateExportCsv, generateAccountingCsv };
  return {
    service: new SalesExportService(prisma as never, sales as never),
    generateExportCsv,
    generateAccountingCsv,
  };
}

describe('SalesExportService', () => {
  it('requestExport sin Redis procesa en el momento y queda COMPLETED', async () => {
    const prisma = makePrisma();
    const { service, generateExportCsv } = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({ storeId: 'store-1' }, USER, 'ADMIN'),
    );

    // Crea el registro con el tenant y el solicitante; guarda solo los filtros.
    const createArg = prisma.salesExport.create.mock.calls[0]![0] as {
      data: { organizationId: string; requestedById: string; filters: unknown };
    };
    expect(createArg.data.organizationId).toBe(ORG);
    expect(createArg.data.requestedById).toBe(USER);
    // Los filtros guardados incluyen el formato (por defecto 'sales').
    expect(createArg.data.filters).toEqual({ storeId: 'store-1', format: 'sales' });
    // Genera el CSV con los filtros de BD (sin `format`, que se separa antes).
    expect(generateExportCsv).toHaveBeenCalledWith({ storeId: 'store-1' }, USER, 'ADMIN');
    // PROCESSING + COMPLETED.
    expect(prisma.salesExport.updateMany).toHaveBeenCalledTimes(2);
    const completed = prisma.salesExport.updateMany.mock.calls[1]![0] as {
      data: { status: string; rowCount: number };
    };
    expect(completed.data.status).toBe('COMPLETED');
    expect(completed.data.rowCount).toBe(2);
    expect(res).toEqual({ id: 'exp-1', status: 'COMPLETED' });
  });

  it('marca FAILED y guarda el error si la generación falla', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'FAILED' }));
    const gen = vi.fn(async () => {
      throw new Error('boom');
    });
    const { service } = makeService(prisma, gen);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({}, USER, 'ADMIN'),
    );

    const failed = prisma.salesExport.updateMany.mock.calls[1]![0] as {
      data: { status: string; error: string };
    };
    expect(failed.data.status).toBe('FAILED');
    expect(failed.data.error).toBe('boom');
    expect(res.status).toBe('FAILED');
  });

  it('getExport lanza si el export no existe', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => null);
    const { service } = makeService(prisma);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.getExport('missing')),
    ).rejects.toThrow();
  });

  it('downloadCsv devuelve el CSV y filename ventas.csv (formato por defecto)', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'COMPLETED', csv: 'h\nr' }));
    const { service } = makeService(prisma);
    const out = await tenantStorage.run({ organizationId: ORG }, () =>
      service.downloadCsv('exp-1'),
    );
    expect(out.csv).toBe('h\nr');
    // Sin format en filters (registro antiguo) → filename de ventas.
    expect(out.filename).toBe('ventas.csv');
  });

  it('downloadCsv lanza 409 si aún no está listo', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'PROCESSING', csv: null }));
    const { service } = makeService(prisma);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.downloadCsv('exp-1')),
    ).rejects.toThrow();
  });

  // ── Ramas adicionales para subir la cobertura de sales-export.service ──────

  it('requestExport sin Redis lanza sin contexto de tenant', async () => {
    const { service } = makeService(makePrisma());
    await expect(service.requestExport({}, USER, 'ADMIN')).rejects.toThrow(/tenant/i);
  });

  it('getExport lanza sin contexto de tenant', async () => {
    const { service } = makeService(makePrisma());
    await expect(service.getExport('exp-1')).rejects.toThrow(/tenant/i);
  });

  it('downloadCsv lanza sin contexto de tenant', async () => {
    const { service } = makeService(makePrisma());
    await expect(service.downloadCsv('exp-1')).rejects.toThrow(/tenant/i);
  });

  it('downloadCsv lanza 404 si el export no existe', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => null);
    const { service } = makeService(prisma);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.downloadCsv('exp-1')),
    ).rejects.toThrow(/no encontrado/i);
  });

  it('downloadCsv lanza 409 si COMPLETED pero csv es null', async () => {
    const prisma = makePrisma();
    // csv es null aunque status sea COMPLETED (registro corrupto)
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'COMPLETED', csv: null }));
    const { service } = makeService(prisma);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () => service.downloadCsv('exp-1')),
    ).rejects.toThrow();
  });

  it('getExport devuelve los metadatos cuando el export existe', async () => {
    const now = new Date();
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({
      id: 'exp-1',
      status: 'COMPLETED',
      rowCount: 5,
      error: null,
      createdAt: now,
      completedAt: now,
    }));
    const { service } = makeService(prisma);
    const meta = (await tenantStorage.run({ organizationId: ORG }, () =>
      service.getExport('exp-1'),
    )) as { id: string; status: string; rowCount: number };
    expect(meta.id).toBe('exp-1');
    expect(meta.status).toBe('COMPLETED');
    expect(meta.rowCount).toBe(5);
  });

  it('requestExport filtra solo las propiedades de ExportFilters (descarta page/pageSize)', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    // Pasamos `page` y `pageSize` dentro del objeto (que en runtime pueden venir del DTO)
    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport(
        { storeId: 'store-2', date: '2024-01-01', from: '2024-01-01', to: '2024-01-31' },
        USER,
        'MANAGER',
      ),
    );

    const createArg = prisma.salesExport.create.mock.calls[0]![0] as {
      data: { filters: Record<string, unknown> };
    };
    // Solo los campos de filtro admitidos (+ format) deben haberse guardado.
    expect(createArg.data.filters).toEqual({
      storeId: 'store-2',
      date: '2024-01-01',
      from: '2024-01-01',
      to: '2024-01-31',
      format: 'sales',
    });
  });

  it('requestExport propaga el rol MANAGER a generateExportCsv', async () => {
    const prisma = makePrisma();
    const { service, generateExportCsv } = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({ q: 'test' }, USER, 'MANAGER'),
    );

    expect(generateExportCsv).toHaveBeenCalledWith({ q: 'test' }, USER, 'MANAGER');
  });

  it('requestExport con format accounting genera el CSV contable (libro de IVA)', async () => {
    const prisma = makePrisma();
    const { service, generateAccountingCsv, generateExportCsv } = makeService(prisma);

    const res = await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({ from: '2026-06-01', to: '2026-06-30' }, USER, 'ADMIN', 'accounting'),
    );

    // Despacha al generador contable (no al de ventas); el `format` se separa de
    // los filtros de BD antes de llamar.
    expect(generateAccountingCsv).toHaveBeenCalledWith(
      { from: '2026-06-01', to: '2026-06-30' },
      USER,
      'ADMIN',
    );
    expect(generateExportCsv).not.toHaveBeenCalled();
    // El formato se persiste en los filtros del registro.
    const createArg = prisma.salesExport.create.mock.calls[0]![0] as {
      data: { filters: Record<string, unknown> };
    };
    expect(createArg.data.filters).toMatchObject({ format: 'accounting' });
    expect(res.status).toBe('COMPLETED');
  });

  it('downloadCsv usa filename libro-iva.csv para un export contable', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({
      status: 'COMPLETED',
      csv: 'h\nr',
      filters: { format: 'accounting' },
    }));
    const { service } = makeService(prisma);
    const out = await tenantStorage.run({ organizationId: ORG }, () =>
      service.downloadCsv('exp-1'),
    );
    expect(out.filename).toBe('libro-iva.csv');
  });

  it('requestExport marca PROCESSING antes de generar el CSV', async () => {
    const prisma = makePrisma();
    // Verificamos que el primer updateMany lleve status PROCESSING
    const calls: Array<unknown> = [];
    prisma.salesExport.updateMany = vi.fn(async (arg: unknown) => {
      calls.push(arg);
      return { count: 1 };
    });
    const { service } = makeService(prisma);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({}, USER, 'ADMIN'),
    );

    const first = calls[0] as { data: { status: string } };
    expect(first.data.status).toBe('PROCESSING');
  });

  it('marca FAILED con el mensaje de error cuando falla con Error no-instancia', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'FAILED' }));
    // Lanzar un string en lugar de Error (rama `String(err)`)
    const gen = vi.fn(async () => {
      throw 'error-string';
    });
    const { service } = makeService(prisma, gen);

    await tenantStorage.run({ organizationId: ORG }, () =>
      service.requestExport({}, USER, 'ADMIN'),
    );

    const failed = prisma.salesExport.updateMany.mock.calls[1]![0] as {
      data: { status: string; error: string };
    };
    expect(failed.data.status).toBe('FAILED');
    expect(failed.data.error).toBe('error-string');
  });

  it('onModuleDestroy no falla cuando no hay queue ni worker (sin Redis)', async () => {
    const { service } = makeService(makePrisma());
    // Sin Redis, queue y worker son null → onModuleDestroy no debe lanzar.
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  // ── Inicialización con Redis: endurecimiento BullMQ (#118) ────────────────
  describe('onModuleInit con Redis', () => {
    afterEach(() => {
      ctorConnections.length = 0;
      queueAdd.mockClear();
      delete process.env.REDIS_URL;
    });

    it('sin REDIS_URL no crea cola (degrada a procesado en el momento)', () => {
      const { service } = makeService(makePrisma());
      service.onModuleInit();
      expect(ctorConnections.length).toBe(0);
    });

    it('con rediss:// fuerza tls en la conexión de la cola', () => {
      process.env.REDIS_URL = 'rediss://cache:6380';
      const { service } = makeService(makePrisma());
      service.onModuleInit();
      expect(ctorConnections[0]).toMatchObject({
        host: 'cache',
        port: 6380,
        tls: { rejectUnauthorized: true },
      });
    });

    it('encola el export con removeOnComplete/removeOnFail (retención acotada)', async () => {
      process.env.REDIS_URL = 'redis://cache:6379';
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      service.onModuleInit();
      await tenantStorage.run({ organizationId: ORG }, () =>
        service.requestExport({}, USER, 'ADMIN'),
      );
      const opts = queueAdd.mock.calls[0]![2] as {
        removeOnComplete: unknown;
        removeOnFail: unknown;
      };
      expect(opts.removeOnComplete).toEqual({ count: 100 });
      expect(opts.removeOnFail).toEqual({ count: 50 });
    });
  });
});
