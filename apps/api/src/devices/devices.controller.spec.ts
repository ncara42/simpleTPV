import { describe, expect, it, vi } from 'vitest';

import { DevicesController } from './devices.controller.js';
import type { DevicesService } from './devices.service.js';

function makeController() {
  const service = {
    status: vi.fn(async (_token?: string) => ({ authorized: false, device: null })),
    create: vi.fn(async (_input: unknown) => ({ id: 'dev-1', pairingToken: 'PAIRING-DEMO' })),
    pair: vi.fn(async (_token: string) => ({ authorized: true, device: { id: 'dev-1' } })),
  } as unknown as DevicesService;
  return { controller: new DevicesController(service), service };
}

describe('DevicesController', () => {
  it('GET /devices/current delega el pairingToken en status', async () => {
    const { controller, service } = makeController();

    const res = (await controller.current('device-demo-token')) as { authorized: boolean };

    expect(service.status).toHaveBeenCalledWith('device-demo-token');
    expect(res.authorized).toBe(false);
  });

  it('POST /devices delega en create con el body', async () => {
    const { controller, service } = makeController();
    const dto = { storeId: 'store-1', name: 'TPV Centro' };

    const res = (await controller.create(dto as never)) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(res.id).toBe('dev-1');
  });

  it('POST /devices/pair delega en pair con el token', async () => {
    const { controller, service } = makeController();

    const res = (await controller.pair({ pairingToken: 'device-demo-token' })) as {
      authorized: boolean;
    };

    expect(service.pair).toHaveBeenCalledWith('device-demo-token');
    expect(res.authorized).toBe(true);
  });
});
