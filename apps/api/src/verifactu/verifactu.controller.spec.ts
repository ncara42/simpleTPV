import { describe, expect, it, vi } from 'vitest';

import { VerifactuController } from './verifactu.controller.js';
import type { VerifactuService } from './verifactu.service.js';

const ID = '11111111-1111-1111-1111-111111111111';

function makeController() {
  const service = {
    list: vi.fn(async (_s?: string) => [{ id: ID, status: 'PENDING' }]),
    retry: vi.fn(async (_id: string) => undefined),
  } as unknown as VerifactuService;
  return { controller: new VerifactuController(service), service };
}

describe('VerifactuController', () => {
  it('GET /verifactu/records pasa el filtro de estado', async () => {
    const { controller, service } = makeController();
    await controller.list('FAILED');
    expect(service.list).toHaveBeenCalledWith('FAILED');
  });

  it('POST /verifactu/records/:id/retry delega y devuelve ok', async () => {
    const { controller, service } = makeController();
    const res = await controller.retry(ID);
    expect(service.retry).toHaveBeenCalledWith(ID);
    expect(res).toEqual({ ok: true });
  });
});
