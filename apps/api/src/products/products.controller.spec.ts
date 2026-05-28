import { describe, expect, it, vi } from 'vitest';

import { ProductsController } from './products.controller.js';
import type { ProductsService } from './products.service.js';

function makeController() {
  const service = {
    create: vi.fn(async (d: unknown) => ({ id: 'p1', ...(d as object) })),
    findAll: vi.fn(async (_s?: string) => [{ id: 'p1' }]),
    findOne: vi.fn(async (id: string) => ({ id })),
    findByBarcode: vi.fn(async (code: string) => ({ id: 'p1', barcode: code })),
    importCsv: vi.fn(async (_csv: string) => ({ inserted: 2, errors: [] })),
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

  it('GET /products/barcode/:code busca por código', async () => {
    const { controller, service } = makeController();
    const res = (await controller.findByBarcode('8410')) as { barcode: string };
    expect(service.findByBarcode).toHaveBeenCalledWith('8410');
    expect(res.barcode).toBe('8410');
  });

  it('POST /products/import pasa el csv al servicio', async () => {
    const { controller, service } = makeController();
    const res = await controller.importCsv({ csv: 'name,salePrice\nX,1' });
    expect(service.importCsv).toHaveBeenCalledWith('name,salePrice\nX,1');
    expect(res.inserted).toBe(2);
  });
});
