import { describe, expect, it, vi } from 'vitest';

import { PriceListsController } from './price-lists.controller.js';

// Controller fino: delega en PriceListsService.
// Instanciamos directamente sin NestJS para verificar que los métodos
// delegan correctamente con sus argumentos.

function makeService() {
  return {
    list: vi.fn(async () => [{ id: 'pl-1', name: 'Tarifa general' }]),
    get: vi.fn(async (id: string) => ({ id, name: 'Tarifa X' })),
    create: vi.fn(async (dto: unknown) => ({ id: 'pl-new', ...(dto as object) })),
    update: vi.fn(async (id: string, dto: unknown) => ({ id, ...(dto as object) })),
    remove: vi.fn(async (_id: string) => undefined),
    setItem: vi.fn(async (id: string, dto: unknown) => ({ id, ...(dto as object) })),
    removeItem: vi.fn(async (_id: string, _productId: string) => undefined),
  };
}

describe('PriceListsController', () => {
  it('list delega en priceLists.list() y devuelve su resultado', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);

    const res = await ctrl.list();

    expect(svc.list).toHaveBeenCalledOnce();
    expect(res).toEqual([{ id: 'pl-1', name: 'Tarifa general' }]);
  });

  it('get delega en priceLists.get() con el id', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);

    const res = await ctrl.get('pl-1');

    expect(svc.get).toHaveBeenCalledWith('pl-1');
    expect((res as { id: string }).id).toBe('pl-1');
  });

  it('create delega en priceLists.create() con el DTO recibido', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);
    const dto = { name: 'Tarifa mayorista' } as never;

    await ctrl.create(dto);

    expect(svc.create).toHaveBeenCalledWith(dto);
  });

  it('update delega en priceLists.update() con el id y el DTO', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);
    const dto = { name: 'Actualizada', active: false } as never;

    await ctrl.update('pl-2', dto);

    expect(svc.update).toHaveBeenCalledWith('pl-2', dto);
  });

  it('remove delega en priceLists.remove() con el id', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);

    await ctrl.remove('pl-3');

    expect(svc.remove).toHaveBeenCalledWith('pl-3');
  });

  it('setItem delega en priceLists.setItem() con el id de tarifa y el DTO del ítem', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);
    const dto = { productId: 'prod-1', price: 5.99 } as never;

    await ctrl.setItem('pl-4', dto);

    expect(svc.setItem).toHaveBeenCalledWith('pl-4', dto);
  });

  it('removeItem delega en priceLists.removeItem() con el id y productId', async () => {
    const svc = makeService();
    const ctrl = new PriceListsController(svc as never);

    await ctrl.removeItem('pl-5', 'prod-9');

    expect(svc.removeItem).toHaveBeenCalledWith('pl-5', 'prod-9');
  });
});
