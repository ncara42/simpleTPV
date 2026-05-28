import { describe, expect, it, vi } from 'vitest';

import { SuppliersController } from './suppliers.controller.js';
import type { SuppliersService } from './suppliers.service.js';

const ID = '11111111-1111-1111-1111-111111111111';

function makeController() {
  const service = {
    findAll: vi.fn(async () => [{ id: ID, name: 'A' }]),
    findOne: vi.fn(async (_id: string) => ({ id: ID, name: 'A' })),
    create: vi.fn(async (dto: unknown) => ({ id: ID, ...(dto as object) })),
    update: vi.fn(async (_id: string, dto: unknown) => ({ id: ID, ...(dto as object) })),
    remove: vi.fn(async (_id: string) => undefined),
  } as unknown as SuppliersService;
  return { controller: new SuppliersController(service), service };
}

describe('SuppliersController', () => {
  it('GET /suppliers delega en findAll', async () => {
    const { controller, service } = makeController();
    const res = (await controller.findAll()) as Array<{ name: string }>;
    expect(service.findAll).toHaveBeenCalledOnce();
    expect(res[0]!.name).toBe('A');
  });

  it('POST /suppliers delega el body en create', async () => {
    const { controller, service } = makeController();
    await controller.create({ name: 'Prov', leadTimeDays: 3 });
    expect(service.create).toHaveBeenCalledWith({ name: 'Prov', leadTimeDays: 3 });
  });

  it('PATCH /suppliers/:id delega id y body', async () => {
    const { controller, service } = makeController();
    await controller.update(ID, { name: 'X' });
    expect(service.update).toHaveBeenCalledWith(ID, { name: 'X' });
  });

  it('DELETE /suppliers/:id delega en remove', async () => {
    const { controller, service } = makeController();
    await controller.remove(ID);
    expect(service.remove).toHaveBeenCalledWith(ID);
  });
});
