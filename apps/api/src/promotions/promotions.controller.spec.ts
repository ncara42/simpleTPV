import { describe, expect, it, vi } from 'vitest';

import { PromotionsController } from './promotions.controller.js';

// Controller fino: delega cada ruta en PromotionsService sin lógica propia.
function makeService() {
  return {
    findAll: vi.fn(async () => []),
    findOne: vi.fn(async () => ({ id: 'p1' })),
    create: vi.fn(async () => ({ id: 'p1' })),
    update: vi.fn(async () => ({ id: 'p1' })),
    remove: vi.fn(async () => undefined),
  };
}

describe('PromotionsController', () => {
  it('findAll delega en promotions.findAll()', async () => {
    const svc = makeService();
    const ctrl = new PromotionsController(svc as never);

    await ctrl.findAll();

    expect(svc.findAll).toHaveBeenCalledOnce();
  });

  it('findOne delega con el id', async () => {
    const svc = makeService();
    const ctrl = new PromotionsController(svc as never);

    await ctrl.findOne('p1');

    expect(svc.findOne).toHaveBeenCalledWith('p1');
  });

  it('create delega con el body validado', async () => {
    const svc = makeService();
    const ctrl = new PromotionsController(svc as never);
    const body = { name: '3x2' } as never;

    await ctrl.create(body);

    expect(svc.create).toHaveBeenCalledWith(body);
  });

  it('update delega con el id y el body', async () => {
    const svc = makeService();
    const ctrl = new PromotionsController(svc as never);
    const body = { active: false } as never;

    await ctrl.update('p1', body);

    expect(svc.update).toHaveBeenCalledWith('p1', body);
  });

  it('remove delega con el id', async () => {
    const svc = makeService();
    const ctrl = new PromotionsController(svc as never);

    await ctrl.remove('p1');

    expect(svc.remove).toHaveBeenCalledWith('p1');
  });
});
