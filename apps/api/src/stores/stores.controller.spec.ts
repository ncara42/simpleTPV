import { describe, expect, it, vi } from 'vitest';

import { StoresController } from './stores.controller.js';

// Controller fino solo-ADMIN: delega en StoresService sin transformar argumentos.
// Instanciamos sin NestJS para verificar el cableado de argumentos.

function makeService() {
  return {
    findAll: vi.fn(async () => [{ id: 'store-1', name: 'Centro' }]),
    create: vi.fn(async (dto: unknown) => ({ id: 'store-2', ...(dto as object) })),
    update: vi.fn(async (id: string, dto: unknown) => ({ id, ...(dto as object) })),
    remove: vi.fn(async (_id: string) => undefined),
    setCentral: vi.fn(async (id: string, isCentral: boolean) => ({ id, isCentral })),
  };
}

describe('StoresController', () => {
  it('findAll delega en el servicio y devuelve su resultado', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);

    const res = await ctrl.findAll();

    expect(svc.findAll).toHaveBeenCalledOnce();
    expect(res).toEqual([{ id: 'store-1', name: 'Centro' }]);
  });

  it('create delega con el DTO', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);
    const dto = { name: 'Norte', address: 'C/ Mayor 1' } as never;

    const res = await ctrl.create(dto);

    expect(svc.create).toHaveBeenCalledWith(dto);
    expect(res).toMatchObject({ id: 'store-2', name: 'Norte' });
  });

  it('update delega con id y DTO', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);
    const dto = { name: 'Centro 2' } as never;

    const res = await ctrl.update('store-1', dto);

    expect(svc.update).toHaveBeenCalledWith('store-1', dto);
    expect(res).toMatchObject({ id: 'store-1', name: 'Centro 2' });
  });

  it('remove delega con el id', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);

    await ctrl.remove('store-1');

    expect(svc.remove).toHaveBeenCalledWith('store-1');
  });

  it('setCentral marca por defecto (isCentral implícito = true)', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);

    const res = await ctrl.setCentral('store-1', {});

    expect(svc.setCentral).toHaveBeenCalledWith('store-1', true);
    expect(res).toMatchObject({ id: 'store-1', isCentral: true });
  });

  it('setCentral con isCentral=false desmarca la tienda', async () => {
    const svc = makeService();
    const ctrl = new StoresController(svc as never);

    await ctrl.setCentral('store-1', { isCentral: false });

    expect(svc.setCentral).toHaveBeenCalledWith('store-1', false);
  });
});
