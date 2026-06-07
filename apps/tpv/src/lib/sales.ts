import {
  ApiError,
  type CreateSaleInput,
  type Sale,
  type SalesPage,
  type SalesQueryInput,
  type SaleTicket,
  type Store,
} from '@simpletpv/auth';

import { DEMO_STORES } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';
import { renderReceiptHtml } from './receipt.js';

export type { Sale, SaleTicket, Store };

// Tiendas accesibles para el usuario logueado (su organización). En real usa
// /me/stores (la org sale del JWT); en demo, las tiendas calcadas del mockup.
export function listStores(): Promise<Store[]> {
  if (isDemo()) return Promise.resolve(DEMO_STORES);
  return api.get<Store[]>('/me/stores');
}

export function createSale(input: CreateSaleInput): Promise<Sale> {
  if (isDemo()) {
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
  // clientId también online: salvaguarda de idempotencia ante un reintento por
  // red inestable (el backend deduplica por clientId). El camino offline se
  // gestiona en el flujo de cobro (CartPanel) vía la cola de ventas.
  return api.post<Sale>('/sales', { ...input, clientId: input.clientId ?? crypto.randomUUID() });
}

export function listSales(query: SalesQueryInput): Promise<SalesPage> {
  if (isDemo()) {
    const sale = {
      id: 'demo-sale',
      ticketNumber: 'T01-000042',
      createdAt: '2026-06-02T14:05:00.000Z',
      total: '73.80',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      storeId: query.storeId ?? 'demo-store-centro',
      user: { name: 'Marta Ruiz' },
      store: { name: 'Tienda Centro', code: 'CENTRO' },
    };
    return Promise.resolve({
      items: [sale],
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      totalItems: 1,
      totals: { count: 1, totalAmount: '73.80', avgDiscountPct: 0.05, avgMarginPct: 0.42 },
    });
  }
  return api.get<SalesPage>('/sales', {
    ...(query.storeId ? { storeId: query.storeId } : {}),
    ...(query.date ? { date: query.date } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.page ? { page: String(query.page) } : {}),
    ...(query.pageSize ? { pageSize: String(query.pageSize) } : {}),
  });
}

export function getTicket(id: string): Promise<SaleTicket> {
  if (isDemo()) {
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
          discountAmt: '0',
          lineTotal: '24.90',
        },
        {
          name: 'Flor Lemon Haze 2g',
          qty: '2',
          unitPrice: '14.50',
          discountPct: '0',
          discountAmt: '0',
          lineTotal: '29.00',
        },
        {
          name: 'Crema regeneradora 50ml',
          qty: '1',
          unitPrice: '19.90',
          discountPct: '0',
          discountAmt: '0',
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
  return api.get<SaleTicket>(`/sales/${id}/ticket`);
}

// Documento fiscal imprimible/descargable de la venta (#123). En modo real
// descarga el HTML que genera el servidor (fuente de verdad); en demo lo replica
// en cliente desde el ticket-resumen (sin backend). Devuelve el HTML como string.
export async function getReceiptHtml(id: string): Promise<string> {
  if (isDemo()) {
    const ticket = await getTicket(id);
    return renderReceiptHtml(ticket);
  }
  const res = await api.fetch(`/sales/${id}/receipt`);
  if (!res.ok) {
    throw new ApiError(res.status, 'No se pudo generar la factura');
  }
  return res.text();
}

export function voidSale(id: string): Promise<Sale> {
  if (isDemo()) {
    return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' }).then((s) => ({
      ...s,
      id,
      status: 'VOIDED',
      voidedAt: '2026-06-02T14:10:00.000Z',
    }));
  }
  return api.post<Sale>(`/sales/${id}/void`, {});
}

export function findSaleByTicket(ticketNumber: string): Promise<Sale> {
  if (isDemo()) return createSale({ storeId: 'demo', lines: [], paymentMethod: 'CASH' });
  return api.get<Sale>(`/sales/by-ticket/${encodeURIComponent(ticketNumber)}`);
}
