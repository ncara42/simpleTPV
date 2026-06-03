import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { TimeClockController } from './time-clock.controller.js';
import type { TimeClockService } from './time-clock.service.js';

function makeController() {
  const service = {
    current: vi.fn(async (_storeId: string, _userId: string) => ({ id: 'tc-1', type: 'CLOCK_IN' })),
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

  it('POST /time-clock delega body y sub', async () => {
    const { controller, service } = makeController();
    const dto = { storeId: 'store-1', deviceId: 'dev-1', type: 'CLOCK_OUT' as const };

    const res = (await controller.create(dto, req('CLERK'))) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    expect(res.id).toBe('tc-2');
  });
});
