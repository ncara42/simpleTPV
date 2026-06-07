import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { SalesController } from './sales.controller.js';
import type { SalesService } from './sales.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

function makeController() {
  const service = {
    create: vi.fn(async (_dto: unknown, _userId: string, _role: string) => ({ id: 'sale-1' })),
    getTicket: vi.fn(async (_id: string) => ({ ticketNumber: 'T01-000001' })),
    getReceiptHtml: vi.fn(async (_id: string) => '<!DOCTYPE html><html lang="es"></html>'),
    findByTicket: vi.fn(async (_t: string) => ({ id: 'sale-1', ticketNumber: 'T01-000001' })),
    voidSale: vi.fn(async (_id: string, _userId: string) => ({ id: 'sale-1', status: 'VOIDED' })),
    reserveTicketBlock: vi.fn(async (_s: string, _n: number, _u: string, _r: string) => ({
      code: 'CENTRO',
      from: 43,
      to: 62,
    })),
    findSales: vi.fn(async (_q: unknown) => ({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totals: { count: 0, totalAmount: 0 },
    })),
  } as unknown as SalesService;
  return { controller: new SalesController(service), service };
}

function req(role: string): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: ORG, role } as JwtPayload };
}

describe('SalesController', () => {
  it('POST /sales delega en create con el sub y el rol del usuario', async () => {
    const { controller, service } = makeController();
    const dto = { storeId: STORE, lines: [], paymentMethod: 'CASH' as const };

    const res = (await controller.create(dto as never, req('CLERK'))) as { id: string };

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1', 'CLERK');
    expect(res.id).toBe('sale-1');
  });

  it('POST /sales/ticket-block delega con storeId, size, sub y rol', async () => {
    const { controller, service } = makeController();

    const res = (await controller.reserveTicketBlock(
      { storeId: STORE, size: 20 },
      req('CLERK'),
    )) as {
      code: string;
      from: number;
      to: number;
    };

    expect(service.reserveTicketBlock).toHaveBeenCalledWith(STORE, 20, 'user-1', 'CLERK');
    expect(res).toEqual({ code: 'CENTRO', from: 43, to: 62 });
  });

  it('GET /sales/:id/ticket pasa el id al servicio', async () => {
    const { controller, service } = makeController();

    const res = (await controller.getTicket('sale-1')) as { ticketNumber: string };

    expect(service.getTicket).toHaveBeenCalledWith('sale-1');
    expect(res.ticketNumber).toBe('T01-000001');
  });

  it('GET /sales/:id/receipt devuelve el documento HTML de la factura', async () => {
    const { controller, service } = makeController();

    const res = await controller.getReceipt('sale-1');

    expect(service.getReceiptHtml).toHaveBeenCalledWith('sale-1');
    expect(res).toContain('<!DOCTYPE html>');
  });

  it('GET /sales/by-ticket/:ticketNumber pasa el nº de ticket al servicio', async () => {
    const { controller, service } = makeController();

    const res = (await controller.findByTicket('T01-000001')) as { id: string };

    expect(service.findByTicket).toHaveBeenCalledWith('T01-000001');
    expect(res.id).toBe('sale-1');
  });

  it('POST /sales/:id/void pasa id y sub del usuario', async () => {
    const { controller, service } = makeController();

    const res = (await controller.voidSale('sale-1', req('MANAGER'))) as { status: string };

    expect(service.voidSale).toHaveBeenCalledWith('sale-1', 'user-1');
    expect(res.status).toBe('VOIDED');
  });

  it('GET /sales delega la query del listado en findSales', async () => {
    const { controller, service } = makeController();
    const query = { storeId: STORE, date: '2026-05-28', page: 2, pageSize: 10 };

    const res = (await controller.findSales(query, req('MANAGER'))) as { page: number };

    expect(service.findSales).toHaveBeenCalledWith(query, 'user-1', 'MANAGER');
    expect(res).toMatchObject({ page: 1, totals: { count: 0, totalAmount: 0 } });
  });

  it('GET /sales sin filtros pasa la query vacía tal cual', async () => {
    const { controller, service } = makeController();

    await controller.findSales({}, req('ADMIN'));

    expect(service.findSales).toHaveBeenCalledWith({}, 'user-1', 'ADMIN');
  });
});
