import type { CreateSaleInput, Sale, SaleTicket, Store } from '@simpletpv/auth';

import { DEMO_STORES } from '../demo/demoData.js';

export type { Sale, SaleTicket, Store };

export function listStores(): Promise<Store[]> {
  return Promise.resolve(DEMO_STORES);
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  const total = '73.80';
  return Promise.resolve({
    id: 'demo-sale',
    storeId: input.storeId,
    userId: 'demo',
    ticketNumber: 'T01-000042',
    subtotal: '60.99',
    discountTotal: '0',
    total,
    paymentMethod: input.paymentMethod,
    cashGiven: input.cashGiven != null ? input.cashGiven.toFixed(2) : null,
    cashChange: input.cashGiven != null ? (input.cashGiven - Number(total)).toFixed(2) : null,
    status: 'COMPLETED',
    voidedAt: null,
    voidedBy: null,
    createdAt: '2026-06-02T14:05:00.000Z',
    lines: [],
  });
}

export function getTicket(_id: string): Promise<SaleTicket> {
  return Promise.resolve({
    organization: { name: 'SimpleTPV', nif: 'B12345678' },
    store: { name: 'Tienda Centro', code: 'CENTRO' },
    ticketNumber: 'T01-000042',
    createdAt: '2026-06-02T14:05:00.000Z',
    lines: [
      {
        name: 'Aceite CBD 10%',
        qty: '1',
        unitPrice: '24.90',
        discountPct: '0',
        lineTotal: '24.90',
      },
      {
        name: 'Flor Lemon Haze 2g',
        qty: '2',
        unitPrice: '14.50',
        discountPct: '0',
        lineTotal: '29.00',
      },
      {
        name: 'Crema regeneradora 50ml',
        qty: '1',
        unitPrice: '19.90',
        discountPct: '0',
        lineTotal: '19.90',
      },
    ],
    subtotal: '60.99',
    discountTotal: '0',
    total: '73.80',
    paymentMethod: 'CASH',
    cashGiven: null,
    cashChange: null,
    taxBreakdown: [{ taxRate: '21', base: '60.99', cuota: '12.81' }],
  });
}

export function voidSale(id: string): Promise<Sale> {
  return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' }).then((s) => ({
    ...s,
    id,
    status: 'VOIDED',
    voidedAt: '2026-06-02T14:10:00.000Z',
  }));
}

export function findSaleByTicket(_ticketNumber: string): Promise<Sale> {
  return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' });
}
