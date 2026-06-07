import { describe, expect, it, vi } from 'vitest';

import { SalesExportController } from './sales-export.controller.js';

// Controller fino: delega en SalesExportService.
// Instanciamos directamente sin NestJS para verificar que los métodos
// delegan con los argumentos correctos.

function makeService() {
  return {
    requestExport: vi.fn(async (..._a: unknown[]) => ({ id: 'exp-1', status: 'PENDING' })),
    getExport: vi.fn(async (id: string) => ({
      id,
      status: 'COMPLETED',
      rowCount: 10,
      error: null,
      createdAt: new Date(),
      completedAt: new Date(),
    })),
    downloadCsv: vi.fn(async (_id: string) => ({
      csv: 'col1,col2\nv1,v2',
      filename: 'ventas.csv',
    })),
  };
}

// Respuesta simulada para @Res({ passthrough: true }): solo necesitamos setHeader.
function makeRes() {
  return { setHeader: vi.fn() };
}

// Simula el req.user que NestJS inyectaría desde el JWT verificado.
function makeReq(sub = 'user-1', role = 'ADMIN') {
  return { user: { sub, role } };
}

describe('SalesExportController', () => {
  it('requestExport delega en exports.requestExport() con el body, sub y role', async () => {
    const svc = makeService();
    const ctrl = new SalesExportController(svc as never);
    const body = { storeId: 'store-1', date: '2024-01-01' } as never;
    const req = makeReq('user-42', 'MANAGER');

    const res = await ctrl.requestExport(body, req as never);

    expect(svc.requestExport).toHaveBeenCalledWith(body, 'user-42', 'MANAGER');
    expect(res).toEqual({ id: 'exp-1', status: 'PENDING' });
  });

  it('requestExport pasa el rol ADMIN al servicio', async () => {
    const svc = makeService();
    const ctrl = new SalesExportController(svc as never);
    const req = makeReq('user-1', 'ADMIN');

    await ctrl.requestExport({} as never, req as never);

    const [, , role] = svc.requestExport.mock.calls[0]!;
    expect(role).toBe('ADMIN');
  });

  it('getExport delega en exports.getExport() con el id y devuelve los metadatos', async () => {
    const svc = makeService();
    const ctrl = new SalesExportController(svc as never);

    const res = await ctrl.getExport('exp-99');

    expect(svc.getExport).toHaveBeenCalledWith('exp-99');
    expect((res as { id: string }).id).toBe('exp-99');
    expect((res as { status: string }).status).toBe('COMPLETED');
  });

  it('download delega en downloadCsv(), fija las cabeceras y devuelve el CSV', async () => {
    const svc = makeService();
    const ctrl = new SalesExportController(svc as never);
    const res = makeRes();

    const csv = await ctrl.download('exp-77', res as never);

    expect(svc.downloadCsv).toHaveBeenCalledWith('exp-77');
    expect(csv).toBe('col1,col2\nv1,v2');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="ventas.csv"',
    );
  });

  it('download usa el filename del servicio (libro-iva.csv para export contable)', async () => {
    const svc = makeService();
    svc.downloadCsv = vi.fn(async (_id: string) => ({ csv: 'x', filename: 'libro-iva.csv' }));
    const ctrl = new SalesExportController(svc as never);
    const res = makeRes();

    await ctrl.download('exp-acc', res as never);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="libro-iva.csv"',
    );
  });

  it('download propaga la excepción del servicio (ej. 409)', async () => {
    const svc = makeService();
    svc.downloadCsv = vi.fn(async (..._a: unknown[]) => {
      throw new Error('Export no listo');
    });
    const ctrl = new SalesExportController(svc as never);

    await expect(ctrl.download('exp-not-ready', makeRes() as never)).rejects.toThrow(
      'Export no listo',
    );
  });

  it('requestAccountingExport delega con format "accounting"', async () => {
    const svc = makeService();
    const ctrl = new SalesExportController(svc as never);
    const body = { from: '2026-06-01', to: '2026-06-30' } as never;

    await ctrl.requestAccountingExport(body, makeReq('user-7', 'MANAGER') as never);

    expect(svc.requestExport).toHaveBeenCalledWith(body, 'user-7', 'MANAGER', 'accounting');
  });

  it('requestExport devuelve el id y status que devuelve el servicio', async () => {
    const svc = makeService();
    svc.requestExport = vi.fn(async (..._a: unknown[]) => ({ id: 'exp-abc', status: 'COMPLETED' }));
    const ctrl = new SalesExportController(svc as never);

    const res = await ctrl.requestExport({} as never, makeReq() as never);

    expect(res).toEqual({ id: 'exp-abc', status: 'COMPLETED' });
  });
});
