import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import type { TransfersService } from '../transfers/transfers.service.js';
import { StoreOrdersController } from './store-orders.controller.js';

function makeController() {
  const service = {
    create: vi.fn(async (_dto: unknown, _userId: string) => ({ id: 'so-1' })),
    list: vi.fn(async (_status?: string) => [{ id: 'so-1' }]),
    get: vi.fn(async (_id: string) => ({ id: 'so-1' })),
    send: vi.fn(async (_id: string, _userId: string) => ({ id: 'so-1', status: 'SENT' })),
    receive: vi.fn(async (_id: string, _dto: unknown, _userId: string) => ({
      id: 'so-1',
      status: 'RECEIVED',
    })),
    close: vi.fn(async (_id: string) => ({ id: 'so-1', status: 'CLOSED' })),
  } as unknown as TransfersService;
  return { controller: new StoreOrdersController(service), service };
}

function req(role: string): { user: JwtPayload } {
  return {
    user: {
      sub: 'user-1',
      organizationId: '11111111-1111-1111-1111-111111111111',
      role,
    } as JwtPayload,
  };
}

describe('StoreOrdersController', () => {
  it('POST /store-orders delega en create con el sub', async () => {
    const { controller, service } = makeController();
    const dto = {
      originStoreId: 's1',
      destStoreId: 's2',
      lines: [{ productId: 'p1', quantitySent: 2 }],
    };

    const res = (await controller.create(dto as never, req('MANAGER'))) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    expect(res.id).toBe('so-1');
  });

  it('GET /store-orders delega el status en list', async () => {
    const { controller, service } = makeController();

    const res = (await controller.list('SENT')) as Array<{ id: string }>;

    expect(service.list).toHaveBeenCalledWith('SENT');
    expect(res[0]!.id).toBe('so-1');
  });

  it('GET /store-orders/:id delega el id en get', async () => {
    const { controller, service } = makeController();

    const res = (await controller.get('so-1')) as { id: string };

    expect(service.get).toHaveBeenCalledWith('so-1');
    expect(res.id).toBe('so-1');
  });

  it('POST /store-orders/:id/send delega en send con el sub', async () => {
    const { controller, service } = makeController();

    const res = (await controller.send('so-1', req('MANAGER'))) as { status: string };

    expect(service.send).toHaveBeenCalledWith('so-1', 'user-1');
    expect(res.status).toBe('SENT');
  });

  it('POST /store-orders/:id/receive delega en receive con el sub', async () => {
    const { controller, service } = makeController();
    const dto = { lines: [{ lineId: 'l1', quantityReceived: 2 }] };

    const res = (await controller.receive('so-1', dto as never, req('CLERK'))) as {
      status: string;
    };

    expect(service.receive).toHaveBeenCalledWith('so-1', dto, 'user-1', 'CLERK');
    expect(res.status).toBe('RECEIVED');
  });

  it('POST /store-orders/:id/close delega en close', async () => {
    const { controller, service } = makeController();

    const res = (await controller.close('so-1')) as { status: string };

    expect(service.close).toHaveBeenCalledWith('so-1');
    expect(res.status).toBe('CLOSED');
  });
});
