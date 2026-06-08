import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { TimeClockController } from './time-clock.controller.js';
import type { TimeClockService } from './time-clock.service.js';

function makeController() {
  const service = {
    current: vi.fn(async (_storeId: string, _userId: string) => ({ id: 'tc-1', type: 'CLOCK_IN' })),
    today: vi.fn(async (_storeId: string, _userId: string) => ({ status: 'IN', entries: [] })),
    history: vi.fn(async (_q: unknown, _role: string, _userId: string) => [{ userId: 'u1' }]),
    historyAll: vi.fn(async (_q: unknown) => [{ userId: 'u1', storeId: 's1' }]),
    entries: vi.fn(async (_q: unknown, _role: string, _userId: string) => [{ id: 'e1' }]),
    create: vi.fn(async (_dto: unknown, _userId: string) => ({ id: 'tc-2', type: 'CLOCK_OUT' })),
  } as unknown as TimeClockService;
  return { controller: new TimeClockController(service), service };
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

describe('TimeClockController', () => {
  it('GET /time-clock/current delega storeId y sub', async () => {
    const { controller, service } = makeController();

    const res = (await controller.current('store-1', req('CLERK'))) as { id: string };

    expect(service.current).toHaveBeenCalledWith('store-1', 'user-1');
    expect(res.id).toBe('tc-1');
  });

  it('GET /time-clock/today delega storeId y sub', async () => {
    const { controller, service } = makeController();

    const res = (await controller.today('store-1', req('CLERK'))) as { status: string };

    expect(service.today).toHaveBeenCalledWith('store-1', 'user-1');
    expect(res.status).toBe('IN');
  });

  it('GET /time-clock/history delega query, role y sub', async () => {
    const { controller, service } = makeController();
    const query = { storeId: 'store-1', userId: 'u1' };

    const res = (await controller.history(query, req('MANAGER'))) as Array<{ userId: string }>;

    expect(service.history).toHaveBeenCalledWith(query, 'MANAGER', 'user-1');
    expect(res[0]!.userId).toBe('u1');
  });

  it('GET /time-clock/history-all delega la query (cross-tienda, sin role/sub)', async () => {
    const { controller, service } = makeController();
    const query = { storeId: 'store-1', userId: 'u1' };

    const res = (await controller.historyAll(query)) as Array<{ userId: string; storeId: string }>;

    expect(service.historyAll).toHaveBeenCalledWith(query);
    expect(res[0]!.storeId).toBe('s1');
  });

  it('GET /time-clock/entries delega query, role y sub', async () => {
    const { controller, service } = makeController();
    const query = { storeId: 'store-1' };

    const res = (await controller.entries(query, req('MANAGER'))) as Array<{ id: string }>;

    expect(service.entries).toHaveBeenCalledWith(query, 'MANAGER', 'user-1');
    expect(res[0]!.id).toBe('e1');
  });

  it('GET /time-clock/history/me fuerza el userId del token y un default de 30 días', async () => {
    const { controller, service } = makeController();

    await controller.historyMe({ storeId: 'store-1' }, req('CLERK'));

    // userId SIEMPRE = req.user.sub (no llega del cliente); from por defecto a una
    // fecha YYYY-MM-DD (~30 días atrás); to sin especificar.
    expect(service.history).toHaveBeenCalledWith(
      {
        storeId: 'store-1',
        userId: 'user-1',
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        to: undefined,
      },
      'CLERK',
      'user-1',
    );
  });

  it('GET /time-clock/history/me respeta el rango from/to de la query', async () => {
    const { controller, service } = makeController();

    await controller.historyMe(
      { storeId: 'store-1', from: '2026-05-01', to: '2026-05-31' },
      req('CLERK'),
    );

    expect(service.history).toHaveBeenCalledWith(
      { storeId: 'store-1', userId: 'user-1', from: '2026-05-01', to: '2026-05-31' },
      'CLERK',
      'user-1',
    );
  });

  it('POST /time-clock delega body, sub y role', async () => {
    const { controller, service } = makeController();
    const dto = { storeId: 'store-1', deviceId: 'dev-1', type: 'CLOCK_OUT' as const };

    const res = (await controller.create(dto, req('CLERK'))) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1', 'CLERK');
    expect(res.id).toBe('tc-2');
  });
});
