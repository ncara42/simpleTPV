import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { ReturnsController } from './returns.controller.js';
import type { ReturnsService } from './returns.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const SALE = '22222222-2222-2222-2222-222222222222';

function makeController() {
  const service = {
    create: vi.fn(async (_dto: unknown, _userId: string) => ({ id: 'return-1', total: 20 })),
    list: vi.fn(async (_saleId: string) => [{ id: 'return-1' }]),
  } as unknown as ReturnsService;
  return { controller: new ReturnsController(service), service };
}

function req(role: string): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: ORG, role } as JwtPayload };
}

describe('ReturnsController', () => {
  it('POST /returns delega en create con el body y el sub del usuario', async () => {
    const { controller, service } = makeController();
    const dto = { saleId: SALE, reason: 'roto', lines: [{ saleLineId: 'sl-1', qty: 1 }] };

    const res = (await controller.create(dto as never, req('CLERK'))) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    expect(res.id).toBe('return-1');
  });

  it('GET /returns delega el saleId en list', async () => {
    const { controller, service } = makeController();

    const res = (await controller.list(SALE)) as Array<{ id: string }>;

    expect(service.list).toHaveBeenCalledWith(SALE);
    expect(res[0]!.id).toBe('return-1');
  });
});
