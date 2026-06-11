import { describe, expect, it, vi } from 'vitest';

import { BrandingController } from './branding.controller.js';

// Controller fino: delega en BrandingService sin transformar argumentos.
// Instanciamos sin NestJS para verificar el cableado (patrón StoresController).
function makeService() {
  return {
    get: vi.fn(async () => ({ brandColor: '#aa00ff', logoUrl: null })),
    update: vi.fn(async (dto: unknown) => ({ ...(dto as object), logoUrl: null })),
  };
}

describe('BrandingController', () => {
  it('get delega en el servicio', async () => {
    const svc = makeService();
    const ctrl = new BrandingController(svc as never);
    expect(await ctrl.get()).toEqual({ brandColor: '#aa00ff', logoUrl: null });
    expect(svc.get).toHaveBeenCalledOnce();
  });

  it('update delega con el DTO', async () => {
    const svc = makeService();
    const ctrl = new BrandingController(svc as never);
    const dto = { brandColor: '#112233' } as never;
    await ctrl.update(dto);
    expect(svc.update).toHaveBeenCalledWith(dto);
  });
});
