import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { SalesExportService } from './sales-export.service.js';

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
) {
  const sales = { generateExportCsv };
  return { service: new SalesExportService(prisma as never, sales as never), generateExportCsv };
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
    expect(createArg.data.filters).toEqual({ storeId: 'store-1' });
    // Genera el CSV con los mismos filtros/rol.
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

  it('downloadCsv devuelve el CSV cuando COMPLETED', async () => {
    const prisma = makePrisma();
    prisma.salesExport.findFirst = vi.fn(async () => ({ status: 'COMPLETED', csv: 'h\nr' }));
    const { service } = makeService(prisma);
    const out = await tenantStorage.run({ organizationId: ORG }, () =>
      service.downloadCsv('exp-1'),
    );
    expect(out.csv).toBe('h\nr');
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
    // Solo los campos de filtro admitidos deben haberse guardado.
    expect(createArg.data.filters).toEqual({
      storeId: 'store-2',
      date: '2024-01-01',
      from: '2024-01-01',
      to: '2024-01-31',
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
});
