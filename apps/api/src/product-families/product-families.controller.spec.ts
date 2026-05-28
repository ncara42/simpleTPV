import { describe, expect, it, vi } from 'vitest';

import { ProductFamiliesController } from './product-families.controller.js';
import type { ProductFamiliesService } from './product-families.service.js';

function makeController() {
  const service = {
    create: vi.fn(async (d: unknown) => ({ id: 'f1', ...(d as object) })),
    findTree: vi.fn(async () => [{ id: 'f1', children: [] }]),
    update: vi.fn(async (id: string, d: unknown) => ({ id, ...(d as object) })),
    remove: vi.fn(async (_id: string) => undefined),
  } as unknown as ProductFamiliesService;
  return { controller: new ProductFamiliesController(service), service };
}

describe('ProductFamiliesController', () => {
  it('GET devuelve el árbol', async () => {
    const { controller, service } = makeController();
    const res = await controller.findTree();
    expect(service.findTree).toHaveBeenCalledOnce();
    expect(res).toEqual([{ id: 'f1', children: [] }]);
  });

  it('POST crea', async () => {
    const { controller } = makeController();
    const res = await controller.create({ name: 'Bebidas' });
    expect(res).toMatchObject({ name: 'Bebidas' });
  });

  it('PATCH actualiza', async () => {
    const { controller, service } = makeController();
    await controller.update('f1', { name: 'X' });
    expect(service.update).toHaveBeenCalledWith('f1', { name: 'X' });
  });

  it('DELETE borra', async () => {
    const { controller, service } = makeController();
    await controller.remove('f1');
    expect(service.remove).toHaveBeenCalledWith('f1');
  });
});
