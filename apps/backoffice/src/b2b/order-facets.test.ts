import { describe, expect, it } from 'vitest';

import type { Customer, PriceListSummary, WholesaleOrderSummary } from '../lib/b2b.js';
import {
  activeFacetCount,
  EMPTY_FACETS,
  filterOrders,
  mergeOrders,
  type OrderFacetState,
  orderRef,
  orderSeq,
  PVP_KEY,
  relDays,
  searchBase,
  statusLabel,
  statusTone,
  stepperSteps,
} from './order-facets.js';

// 2026-06-27T10:00:00Z como «ahora» de referencia para los filtros de periodo.
const NOW = new Date('2026-06-27T10:00:00Z').getTime();
const daysAgoIso = (n: number): string => new Date(NOW - n * 86_400_000).toISOString();

function order(over: Partial<WholesaleOrderSummary> = {}): WholesaleOrderSummary {
  return {
    id: 'o1',
    customerId: 'c1',
    customerName: 'Distribuciones Llorente',
    status: 'CONFIRMED',
    total: '1169.40',
    lineCount: 3,
    paymentStatus: 'PENDING',
    dueDate: null,
    paidAt: null,
    createdAt: daysAgoIso(3),
    ...over,
  };
}

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Distribuciones Llorente',
    priceListId: 'pl-dist',
    active: true,
    ...over,
  } as Customer;
}

function priceList(over: Partial<PriceListSummary> = {}): PriceListSummary {
  return {
    id: 'pl-dist',
    name: 'Distribuidor',
    active: true,
    itemCount: 0,
    customerCount: 0,
    ...over,
  } as PriceListSummary;
}

describe('orderSeq / orderRef', () => {
  it('deriva un código estable de 4 cifras del id', () => {
    const seq = orderSeq('o1');
    expect(seq).toMatch(/^\d{4}$/);
    expect(orderSeq('o1')).toBe(seq); // determinista
  });

  it('compone la referencia con el año de creación', () => {
    expect(orderRef('2026-06-23T09:00:00Z', '0146')).toBe('PED-2026-0146');
  });
});

describe('mergeOrders', () => {
  it('cruza el pedido con la tarifa del cliente', () => {
    const [v] = mergeOrders([order()], [customer()], [priceList()]);
    expect(v.tariffId).toBe('pl-dist');
    expect(v.tariffKey).toBe('pl-dist');
    expect(v.tariffName).toBe('Distribuidor');
    expect(v.total).toBe(1169.4);
    expect(v.ref).toBe(`PED-2026-${v.seq}`);
  });

  it('cliente sin tarifa → PVP', () => {
    const [v] = mergeOrders([order()], [customer({ priceListId: null })], [priceList()]);
    expect(v.tariffId).toBeNull();
    expect(v.tariffKey).toBe(PVP_KEY);
    expect(v.tariffName).toBe('PVP');
  });
});

describe('filterOrders', () => {
  const views = mergeOrders(
    [
      order({ id: 'a', status: 'DRAFT', customerName: 'Hotel Miramar', createdAt: daysAgoIso(0) }),
      order({ id: 'b', status: 'CONFIRMED', createdAt: daysAgoIso(3) }),
      order({ id: 'c', status: 'SHIPPED', createdAt: daysAgoIso(20) }),
      order({
        id: 'd',
        status: 'CONFIRMED',
        customerId: 'c2',
        customerName: 'Bar Pepe',
        createdAt: daysAgoIso(40),
      }),
    ],
    [customer(), customer({ id: 'c2', priceListId: null })],
    [priceList()],
  );

  it('filtra por estado', () => {
    const f: OrderFacetState = { ...EMPTY_FACETS, estado: 'CONFIRMED' };
    expect(filterOrders(views, f, NOW).map((o) => o.id)).toEqual(['b', 'd']);
  });

  it('filtra por periodo (hoy / 7 / 30 días)', () => {
    expect(
      filterOrders(views, { ...EMPTY_FACETS, periodo: 'today' }, NOW).map((o) => o.id),
    ).toEqual(['a']);
    expect(filterOrders(views, { ...EMPTY_FACETS, periodo: '7' }, NOW).map((o) => o.id)).toEqual([
      'a',
      'b',
    ]);
    expect(filterOrders(views, { ...EMPTY_FACETS, periodo: '30' }, NOW).map((o) => o.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('filtra por tarifa (multi, incluye PVP)', () => {
    const f: OrderFacetState = { ...EMPTY_FACETS, tarifas: new Set(['pl-dist']) };
    expect(filterOrders(views, f, NOW).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    const pvp: OrderFacetState = { ...EMPTY_FACETS, tarifas: new Set([PVP_KEY]) };
    expect(filterOrders(views, pvp, NOW).map((o) => o.id)).toEqual(['d']);
  });

  it('busca por cliente o referencia', () => {
    expect(searchBase(views, 'miramar').map((o) => o.id)).toEqual(['a']);
    expect(searchBase(views, 'no-existe')).toHaveLength(0);
  });

  it('cuenta las facetas activas', () => {
    expect(activeFacetCount(EMPTY_FACETS)).toBe(0);
    expect(
      activeFacetCount({ ...EMPTY_FACETS, estado: 'DRAFT', tarifas: new Set(['pl-dist', 'pvp']) }),
    ).toBe(3);
  });
});

describe('formatters de presentación', () => {
  it('etiqueta y tono por estado', () => {
    expect(statusLabel('SHIPPED')).toBe('Enviado');
    expect(statusTone('DRAFT')).toBe('draft');
    expect(statusTone('CANCELLED')).toBe('cancelled');
  });

  it('antigüedad relativa', () => {
    expect(relDays(daysAgoIso(0), NOW)).toBe('hoy');
    expect(relDays(daysAgoIso(1), NOW)).toBe('ayer');
    expect(relDays(daysAgoIso(3), NOW)).toBe('hace 3 d');
  });
});

describe('stepperSteps', () => {
  it('borrador → primer paso actual, resto por hacer', () => {
    expect(stepperSteps('DRAFT').map((s) => s.state)).toEqual(['current', 'todo', 'todo']);
  });

  it('confirmado → primero hecho, segundo actual', () => {
    expect(stepperSteps('CONFIRMED').map((s) => s.state)).toEqual(['done', 'current', 'todo']);
  });

  it('enviado → todos hechos', () => {
    expect(stepperSteps('SHIPPED').map((s) => s.state)).toEqual(['done', 'done', 'done']);
  });

  it('cancelado → todos los pasos cancelados', () => {
    expect(stepperSteps('CANCELLED').map((s) => s.state)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ]);
  });
});
