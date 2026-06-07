import { describe, expect, it, vi } from 'vitest';

import { ApiKeysController } from './api-keys.controller.js';
import type { ApiKeysService } from './api-keys.service.js';

// El controller es una fachada fina: delega cada ruta en el método homónimo del
// service. Verificamos ese cableado con un service mockeado.
function makeController(): {
  controller: ApiKeysController;
  service: Record<string, ReturnType<typeof vi.fn>>;
} {
  const service = {
    list: vi.fn().mockResolvedValue('list'),
    generate: vi.fn().mockResolvedValue({ id: 'k1', key: 'stpv_x' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  return {
    controller: new ApiKeysController(service as unknown as ApiKeysService),
    service,
  };
}

describe('ApiKeysController', () => {
  it('GET delega en service.list', async () => {
    const { controller, service } = makeController();
    await expect(controller.list()).resolves.toBe('list');
    expect(service.list).toHaveBeenCalledOnce();
  });

  it('POST reenvía el body a service.generate', async () => {
    const { controller, service } = makeController();
    const body = { name: 'integración', priceListId: 'pl1' };
    await expect(controller.generate(body)).resolves.toEqual({ id: 'k1', key: 'stpv_x' });
    expect(service.generate).toHaveBeenCalledWith(body);
  });

  it('DELETE delega en service.revoke con el id de la ruta', async () => {
    const { controller, service } = makeController();
    await expect(controller.revoke('key-1')).resolves.toBeUndefined();
    expect(service.revoke).toHaveBeenCalledWith('key-1');
  });
});
