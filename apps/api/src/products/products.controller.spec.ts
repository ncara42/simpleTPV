import { describe, expect, it, vi } from 'vitest';

import { ProductsController } from './products.controller.js';
import type { ProductsService } from './products.service.js';

function makeController() {
  const service = {
    create: vi.fn(async (d: unknown) => ({ id: 'p1', ...(d as object) })),
    findAll: vi.fn(async (_s?: string) => [{ id: 'p1' }]),
    findOne: vi.fn(async (id: string) => ({ id })),
    update: vi.fn(async (id: string, d: unknown) => ({ id, ...(d as object) })),
    remove: vi.fn(async (_id: string) => undefined),
  } as unknown as ProductsService;
  return { controller: new ProductsController(service), service };
}

describe('ProductsController', () => {
  it('GET /products pasa search y familyId al servicio', async () => {
    const { controller, service } = makeController();
    await controller.findAll('caf', 'fam-1');
    expect(service.findAll).toHaveBeenCalledWith('caf', 'fam-1');
  });

  it('POST /products crea', async () => {
    const { controller } = makeController();
    const res = await controller.create({ name: 'Café', salePrice: 1.5 });
    expect(res).toMatchObject({ name: 'Café' });
  });

  it('PATCH /products/:id actualiza', async () => {
    const { controller, service } = makeController();
    await controller.update('p1', { name: 'X' });
    expect(service.update).toHaveBeenCalledWith('p1', { name: 'X' });
  });

  it('DELETE /products/:id borra', async () => {
    const { controller, service } = makeController();
    await controller.remove('p1');
    expect(service.remove).toHaveBeenCalledWith('p1');
  });
});
