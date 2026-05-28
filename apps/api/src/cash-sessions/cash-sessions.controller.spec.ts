import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { CashSessionsController } from './cash-sessions.controller.js';
import type { CashSessionsService } from './cash-sessions.service.js';

const STORE = '22222222-2222-2222-2222-222222222222';

function makeController() {
  const service = {
    open: vi.fn(async (_dto: unknown, _userId: string) => ({ id: 'cs-1', status: 'OPEN' })),
    close: vi.fn(async (_id: string, _dto: unknown) => ({ id: 'cs-1', status: 'CLOSED' })),
    current: vi.fn(async (_storeId: string) => ({ id: 'cs-1', status: 'OPEN' })),
  } as unknown as CashSessionsService;
  return { controller: new CashSessionsController(service), service };
}

describe('CashSessionsController', () => {
  it('POST /cash-sessions/open delega en el servicio con el sub del usuario', async () => {
    const { controller, service } = makeController();
    const req = {
      user: {
        sub: 'user-1',
        organizationId: '11111111-1111-1111-1111-111111111111',
        role: 'ADMIN',
      } satisfies JwtPayload,
    };

    const res = (await controller.open({ storeId: STORE, openingAmount: 100 }, req)) as {
      status: string;
    };

    expect(service.open).toHaveBeenCalledWith({ storeId: STORE, openingAmount: 100 }, 'user-1');
    expect(res.status).toBe('OPEN');
  });

  it('POST /cash-sessions/:id/close pasa id y body al servicio', async () => {
    const { controller, service } = makeController();

    const res = (await controller.close('cs-1', { countedAmount: 360 })) as { status: string };

    expect(service.close).toHaveBeenCalledWith('cs-1', { countedAmount: 360 });
    expect(res.status).toBe('CLOSED');
  });

  it('GET /cash-sessions/current pasa el storeId al servicio', async () => {
    const { controller, service } = makeController();

    const res = (await controller.current(STORE)) as { status: string };

    expect(service.current).toHaveBeenCalledWith(STORE);
    expect(res.status).toBe('OPEN');
  });
});
