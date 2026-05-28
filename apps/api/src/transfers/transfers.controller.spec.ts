import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { TransfersController } from './transfers.controller.js';
import type { TransfersService } from './transfers.service.js';

const ID = '44444444-4444-4444-4444-444444444444';

function makeController() {
  const service = {
    create: vi.fn(async (_dto: unknown, _u: string) => ({ id: ID, status: 'DRAFT' })),
    list: vi.fn(async (_s?: string) => [{ id: ID }]),
    get: vi.fn(async (_id: string) => ({ id: ID })),
    send: vi.fn(async (_id: string, _u: string) => ({ id: ID, status: 'SENT' })),
    receive: vi.fn(async (_id: string, _dto: unknown, _u: string) => ({
      id: ID,
      status: 'RECEIVED',
    })),
    close: vi.fn(async (_id: string) => ({ id: ID, status: 'CLOSED' })),
  } as unknown as TransfersService;
  return { controller: new TransfersController(service), service };
}

function req(): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: 'org-1', role: 'MANAGER' } as JwtPayload };
}

describe('TransfersController', () => {
  it('POST /transfers delega con el sub del usuario', async () => {
    const { controller, service } = makeController();
    const dto = { originStoreId: 'a', destStoreId: 'b', lines: [] };
    await controller.create(dto as never, req());
    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('GET /transfers pasa el filtro de estado', async () => {
    const { controller, service } = makeController();
    await controller.list('SENT');
    expect(service.list).toHaveBeenCalledWith('SENT');
  });

  it('POST /transfers/:id/send delega id + userId', async () => {
    const { controller, service } = makeController();
    const res = (await controller.send(ID, req())) as { status: string };
    expect(service.send).toHaveBeenCalledWith(ID, 'user-1');
    expect(res.status).toBe('SENT');
  });

  it('POST /transfers/:id/receive delega id, body y userId', async () => {
    const { controller, service } = makeController();
    const body = { lines: [{ lineId: 'l1', quantityReceived: 5 }] };
    await controller.receive(ID, body as never, req());
    expect(service.receive).toHaveBeenCalledWith(ID, body, 'user-1');
  });

  it('POST /transfers/:id/close delega el id', async () => {
    const { controller, service } = makeController();
    const res = (await controller.close(ID)) as { status: string };
    expect(service.close).toHaveBeenCalledWith(ID);
    expect(res.status).toBe('CLOSED');
  });
});
