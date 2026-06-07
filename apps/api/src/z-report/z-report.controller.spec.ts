import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { ZReportController } from './z-report.controller.js';
import type { ZReportService } from './z-report.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const STORE = '22222222-2222-2222-2222-222222222222';

function makeController() {
  const service = {
    getZReport: vi.fn(async (_s: string, _d: string, _u: string, _r: string) => ({
      store: { id: STORE, name: 'Tienda Centro', code: '01' },
      date: '2026-06-07',
      ticketCount: 0,
      voidedCount: 0,
      firstTicketNumber: null,
      lastTicketNumber: null,
      subtotal: 0,
      discountTotal: 0,
      total: 0,
      taxBreakdown: [],
      paymentBreakdown: [],
    })),
  } as unknown as ZReportService;
  return { controller: new ZReportController(service), service };
}

function req(role: string): { user: JwtPayload } {
  return { user: { sub: 'user-1', organizationId: ORG, role } as JwtPayload };
}

describe('ZReportController', () => {
  it('GET /z-report delega storeId, date, sub y rol en el servicio', async () => {
    const { controller, service } = makeController();

    const res = await controller.getZReport({ storeId: STORE, date: '2026-06-07' }, req('MANAGER'));

    expect(service.getZReport).toHaveBeenCalledWith(STORE, '2026-06-07', 'user-1', 'MANAGER');
    expect(res.store.code).toBe('01');
    expect(res.date).toBe('2026-06-07');
  });
});
