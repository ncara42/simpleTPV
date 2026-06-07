import { describe, expect, it, vi } from 'vitest';

import { WholesaleOrdersController } from './wholesale-orders.controller.js';

// Controller fino: delega en WholesaleOrdersService.
// Instanciamos directamente sin NestJS para verificar que los métodos
// delegan correctamente con sus argumentos.

function makeService() {
  return {
    list: vi.fn(async (query: unknown) => [{ id: 'wo-1', ...(query as object) }]),
    get: vi.fn(async (id: string) => ({ id, status: 'PENDING' })),
    create: vi.fn(async (dto: unknown) => ({ id: 'wo-new', ...(dto as object) })),
    updateStatus: vi.fn(async (id: string, status: string) => ({ id, status })),
  };
}

describe('WholesaleOrdersController', () => {
  it('list delega en orders.list() con el query y devuelve su resultado', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);
    const query = { status: 'PENDING', page: 1 } as never;

    const res = await ctrl.list(query);

    expect(svc.list).toHaveBeenCalledWith(query);
    expect(Array.isArray(res)).toBe(true);
  });

  it('list acepta query vacío', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);

    await ctrl.list({} as never);

    expect(svc.list).toHaveBeenCalledWith({});
  });

  it('get delega en orders.get() con el id', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);

    const res = await ctrl.get('wo-1');

    expect(svc.get).toHaveBeenCalledWith('wo-1');
    expect((res as { id: string }).id).toBe('wo-1');
  });

  it('create delega en orders.create() con el DTO recibido', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);
    const dto = {
      customerId: 'c-1',
      lines: [{ productId: 'p-1', qty: 10 }],
    } as never;

    await ctrl.create(dto);

    expect(svc.create).toHaveBeenCalledWith(dto);
  });

  it('updateStatus delega en orders.updateStatus() con el id y el status del body', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);
    const body = { status: 'CONFIRMED' } as never;

    await ctrl.updateStatus('wo-2', body);

    expect(svc.updateStatus).toHaveBeenCalledWith('wo-2', 'CONFIRMED');
  });

  it('updateStatus extrae el campo status del DTO (no pasa el objeto completo)', async () => {
    const svc = makeService();
    const ctrl = new WholesaleOrdersController(svc as never);

    await ctrl.updateStatus('wo-3', { status: 'SHIPPED' } as never);

    // El segundo argumento debe ser el string, no el objeto
    const [idArg, statusArg] = svc.updateStatus.mock.calls[0]!;
    expect(idArg).toBe('wo-3');
    expect(statusArg).toBe('SHIPPED');
    expect(typeof statusArg).toBe('string');
  });
});
