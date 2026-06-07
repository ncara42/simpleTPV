import { describe, expect, it, vi } from 'vitest';

import { CustomersController } from './customers.controller.js';

// El controller es fino: delega todo a CustomersService.
// Instanciamos directamente y verificamos que cada método delega
// con los argumentos correctos (los decoradores NestJS no se ejecutan
// al instanciar manualmente).

function makeService() {
  return {
    list: vi.fn(async () => [{ id: 'c-1', name: 'Acme' }]),
    create: vi.fn(async (dto: unknown) => ({ id: 'c-new', ...(dto as object) })),
    update: vi.fn(async (_id: string, dto: unknown) => ({ id: _id, ...(dto as object) })),
    remove: vi.fn(async (_id: string) => undefined),
  };
}

describe('CustomersController', () => {
  it('list delega en customers.list() y devuelve su resultado', async () => {
    const svc = makeService();
    const ctrl = new CustomersController(svc as never);

    const res = await ctrl.list();

    expect(svc.list).toHaveBeenCalledOnce();
    expect(res).toEqual([{ id: 'c-1', name: 'Acme' }]);
  });

  it('create delega en customers.create() con el DTO recibido', async () => {
    const svc = makeService();
    const ctrl = new CustomersController(svc as never);
    const dto = { name: 'Nuevo cliente', nif: 'B12345678' } as never;

    const res = await ctrl.create(dto);

    expect(svc.create).toHaveBeenCalledWith(dto);
    expect((res as { id: string }).id).toBe('c-new');
  });

  it('update delega en customers.update() con el id y el DTO', async () => {
    const svc = makeService();
    const ctrl = new CustomersController(svc as never);
    const dto = { name: 'Actualizado' } as never;

    await ctrl.update('uuid-1', dto);

    expect(svc.update).toHaveBeenCalledWith('uuid-1', dto);
  });

  it('remove delega en customers.remove() con el id', async () => {
    const svc = makeService();
    const ctrl = new CustomersController(svc as never);

    await ctrl.remove('uuid-2');

    expect(svc.remove).toHaveBeenCalledWith('uuid-2');
  });
});
