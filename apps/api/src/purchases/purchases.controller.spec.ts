import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { PurchasesController } from './purchases.controller.js';
import type { PurchasesService } from './purchases.service.js';

const ID = '44444444-4444-4444-4444-444444444444';

function makeController() {
  const service = {
    create: vi.fn(async (_dto: unknown, _u: string) => ({ id: ID, status: 'DRAFT' })),
    list: vi.fn(async (_s?: string) => [{ id: ID }]),
    get: vi.fn(async (_id: string) => ({ id: ID })),
    confirm: vi.fn(async (_id: string) => ({ id: ID, status: 'CONFIRMED' })),
    suggest: vi.fn(async (_dto: unknown) => [{ productId: 'p1', cantidadSugerida: 10 }]),
    receive: vi.fn(async (_id: string, _dto: unknown, _u: string) => ({
      id: ID,
      status: 'RECEIVED',
    })),
    exportCsv: vi.fn(async (_id: string) => 'producto,cantidad_pedida\nCafé,10'),
  } as unknown as PurchasesService;
  return { controller: new PurchasesController(service), service };
}

function req(): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: 'org-1', role: 'MANAGER' } as JwtPayload };
}

describe('PurchasesController', () => {
  it('POST /purchase-orders delega con el sub del usuario', async () => {
    const { controller, service } = makeController();
    const dto = { supplierId: 's', storeId: 't', lines: [] };
    await controller.create(dto as never, req());
    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('GET /purchase-orders pasa el filtro de estado', async () => {
    const { controller, service } = makeController();
    await controller.list('DRAFT');
    expect(service.list).toHaveBeenCalledWith('DRAFT');
  });

  it('GET /purchase-orders/:id delega en get', async () => {
    const { controller, service } = makeController();
    await controller.get(ID);
    expect(service.get).toHaveBeenCalledWith(ID);
  });

  it('POST /purchase-orders/:id/confirm delega en confirm', async () => {
    const { controller, service } = makeController();
    const res = (await controller.confirm(ID)) as { status: string };
    expect(service.confirm).toHaveBeenCalledWith(ID);
    expect(res.status).toBe('CONFIRMED');
  });

  it('POST /purchase-orders/suggest delega el body en suggest', async () => {
    const { controller, service } = makeController();
    const dto = { storeId: 't', daysCoverage: 7 };
    const res = (await controller.suggest(dto as never)) as Array<{ cantidadSugerida: number }>;
    expect(service.suggest).toHaveBeenCalledWith(dto);
    expect(res[0]!.cantidadSugerida).toBe(10);
  });

  it('POST /purchase-orders/:id/receive delega id, body y userId', async () => {
    const { controller, service } = makeController();
    const body = { lines: [{ lineId: 'l1', quantityReceived: 5 }] };
    await controller.receive(ID, body as never, req());
    expect(service.receive).toHaveBeenCalledWith(ID, body, 'user-1');
  });

  it('GET /purchase-orders/:id/export delega en exportCsv y devuelve CSV', async () => {
    const { controller, service } = makeController();
    const csv = await controller.exportCsv(ID);
    expect(service.exportCsv).toHaveBeenCalledWith(ID);
    expect(csv.startsWith('producto,')).toBe(true);
  });
});
