import { describe, expect, it, vi } from 'vitest';

import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

const ID = '11111111-1111-1111-1111-111111111111';

// Controller fino: delega cada ruta en UsersService. Instanciado sin NestJS
// para verificar el cableado de argumentos (los guards/roles se prueban aparte).
function makeController() {
  const service = {
    findAll: vi.fn(async () => [{ id: ID, name: 'A', storeIds: ['s1'] }]),
    create: vi.fn(async (dto: unknown) => ({ id: ID, ...(dto as object) })),
    importCsv: vi.fn(async () => ({ inserted: 2, errors: [] })),
    update: vi.fn(async (_id: string, dto: unknown) => ({ id: ID, ...(dto as object) })),
    remove: vi.fn(async (_id: string) => undefined),
    setPin: vi.fn(async (_id: string, _pin: string) => undefined),
    assignStores: vi.fn(async (_id: string, _storeIds: string[]) => undefined),
  } as unknown as UsersService;
  return { controller: new UsersController(service), service };
}

describe('UsersController', () => {
  it('GET /users delega en findAll (con storeIds)', async () => {
    const { controller, service } = makeController();
    const res = await controller.findAll();
    expect(service.findAll).toHaveBeenCalledOnce();
    expect(res[0]!.storeIds).toEqual(['s1']);
  });

  it('POST /users delega el body en create', async () => {
    const { controller, service } = makeController();
    const dto = { email: 'a@b.test', name: 'A', password: 'password123', role: 'CLERK' as const };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('POST /users/import delega el csv', async () => {
    const { controller, service } = makeController();
    const res = await controller.importCsv({ csv: 'email,name,password,role\na@b.test,A,x,CLERK' });
    expect(service.importCsv).toHaveBeenCalledOnce();
    expect(res.inserted).toBe(2);
  });

  it('PATCH /users/:id delega id y body', async () => {
    const { controller, service } = makeController();
    await controller.update(ID, { name: 'B' });
    expect(service.update).toHaveBeenCalledWith(ID, { name: 'B' });
  });

  it('DELETE /users/:id delega en remove', async () => {
    const { controller, service } = makeController();
    await controller.remove(ID);
    expect(service.remove).toHaveBeenCalledWith(ID);
  });

  it('PUT /users/:id/pin delega el PIN', async () => {
    const { controller, service } = makeController();
    await controller.setPin(ID, { pin: '1234' });
    expect(service.setPin).toHaveBeenCalledWith(ID, '1234');
  });

  it('PUT /users/:id/stores delega las tiendas', async () => {
    const { controller, service } = makeController();
    await controller.assignStores(ID, { storeIds: ['s1', 's2'] });
    expect(service.assignStores).toHaveBeenCalledWith(ID, ['s1', 's2']);
  });
});
