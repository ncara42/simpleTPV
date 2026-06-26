import { describe, expect, it } from 'vitest';

import type { Customer, CustomerLedgerRow } from '../lib/b2b.js';
import {
  activeFacetCount,
  activeSavedView,
  applySavedView,
  balanceTone,
  type CustomerFacetState,
  type CustomerView,
  daysAgo,
  EMPTY_FACETS,
  filterCustomers,
  initials,
  matches,
  mergeCustomers,
  paymentTermsLabel,
  relOrderDate,
  searchBase,
  tagTone,
} from './customer-facets.js';

// Reloj fijo para fechas relativas/vencidos deterministas (2026-06-26).
const NOW = new Date('2026-06-26T12:00:00Z').getTime();

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Distribuciones Llorente',
    nif: 'B45821190',
    email: 'compras@llorente.es',
    phone: '+34 915 220 184',
    address: 'Madrid',
    priceListId: 'pl-dist',
    tags: ['VIP', 'Distribuidor'],
    paymentTerms: 60,
    salesRep: 'Lucía Marín',
    creditLimit: '12000',
    active: true,
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2026-06-18T00:00:00Z',
    priceList: { id: 'pl-dist', name: 'Distribuidor' },
    ...overrides,
  };
}

function ledger(overrides: Partial<CustomerLedgerRow> = {}): CustomerLedgerRow {
  return {
    customerId: 'c1',
    orderCount: 64,
    lastOrderAt: '2026-06-18T00:00:00Z',
    billed12m: '142300',
    balance: '4280',
    overdue: '1820',
    ...overrides,
  };
}

describe('mergeCustomers', () => {
  it('cruza cliente con su agregado de cartera por customerId', () => {
    const merged = mergeCustomers([customer()], [ledger()]);
    expect(merged[0]).toMatchObject({
      id: 'c1',
      orderCount: 64,
      billed12m: 142300,
      balance: 4280,
      overdue: 1820,
      lastOrderAt: '2026-06-18T00:00:00Z',
    });
  });

  it('asigna ceros y lastOrderAt nulo a clientes sin pedidos (sin fila de ledger)', () => {
    const merged = mergeCustomers([customer({ id: 'nuevo' })], []);
    expect(merged[0]).toMatchObject({
      orderCount: 0,
      billed12m: 0,
      balance: 0,
      overdue: 0,
      lastOrderAt: null,
    });
  });

  it('normaliza campos ausentes de una API antigua (tags undefined → []) sin romper', () => {
    // Simula la forma previa al rediseño: el cliente no trae tags/paymentTerms/etc.
    // El merge debe blindar para que la vista no opere sobre undefined y crashee.
    const legacy = {
      id: 'old',
      name: 'Cliente Legacy',
      nif: null,
      email: null,
      phone: null,
      address: null,
      priceListId: null,
      active: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as unknown as Customer;
    const merged = mergeCustomers([legacy], []);
    expect(merged[0]!.tags).toEqual([]);
    expect(merged[0]!.paymentTerms).toBeNull();
    expect(merged[0]!.creditLimit).toBeNull();
    // Las operaciones que antes crasheaban ahora son seguras.
    expect(() => merged.flatMap((c) => c.tags).sort()).not.toThrow();
    expect(matches(merged[0]!, { ...EMPTY_FACETS, segmentos: new Set(['VIP']) }, NOW)).toBe(false);
  });
});

describe('matches / filterCustomers', () => {
  const llorente = mergeCustomers([customer()], [ledger()])[0]!;
  const farmacia = mergeCustomers(
    [
      customer({
        id: 'c3',
        name: 'Farmacia Centro',
        nif: 'B12345678',
        priceListId: 'pl-may',
        tags: ['Farmacia'],
        active: true,
        priceList: { id: 'pl-may', name: 'Mayorista' },
      }),
    ],
    [ledger({ customerId: 'c3', balance: '0', overdue: '0', lastOrderAt: null, billed12m: '0' })],
  )[0]!;
  const rows: CustomerView[] = [llorente, farmacia];

  it('busca por nombre, NIF, contacto y comercial', () => {
    expect(matches(llorente, { ...EMPTY_FACETS, search: 'llorente' }, NOW)).toBe(true);
    expect(matches(llorente, { ...EMPTY_FACETS, search: 'B45821190' }, NOW)).toBe(true);
    expect(matches(llorente, { ...EMPTY_FACETS, search: 'lucía' }, NOW)).toBe(true);
    expect(matches(llorente, { ...EMPTY_FACETS, search: 'farmacia' }, NOW)).toBe(false);
  });

  it('filtra por saldo: con saldo / con vencido / sin deuda', () => {
    expect(filterCustomers(rows, { ...EMPTY_FACETS, saldo: 'con' }, NOW)).toEqual([llorente]);
    expect(filterCustomers(rows, { ...EMPTY_FACETS, saldo: 'vencido' }, NOW)).toEqual([llorente]);
    expect(filterCustomers(rows, { ...EMPTY_FACETS, saldo: 'sin' }, NOW)).toEqual([farmacia]);
  });

  it('filtra por tarifa (priceListId) y por segmento (tags)', () => {
    const tarifa: CustomerFacetState = { ...EMPTY_FACETS, tarifas: new Set(['pl-dist']) };
    expect(filterCustomers(rows, tarifa, NOW)).toEqual([llorente]);
    const seg: CustomerFacetState = { ...EMPTY_FACETS, segmentos: new Set(['Farmacia']) };
    expect(filterCustomers(rows, seg, NOW)).toEqual([farmacia]);
  });

  it('filtra por último pedido: "sin pedidos" excluye a los que sí tienen', () => {
    expect(filterCustomers(rows, { ...EMPTY_FACETS, fecha: 'none' }, NOW)).toEqual([farmacia]);
    expect(filterCustomers(rows, { ...EMPTY_FACETS, fecha: '30' }, NOW)).toEqual([llorente]);
  });
});

describe('vistas guardadas', () => {
  it('applySavedView produce el estado de facetas esperado', () => {
    expect(applySavedView('deuda').saldo).toBe('con');
    expect(applySavedView('vencido').saldo).toBe('vencido');
    expect(applySavedView('vip').segmentos.has('VIP')).toBe(true);
    expect(applySavedView('inactivos').estado).toBe('inactive');
  });

  it('activeSavedView reconoce la vista activa y null en combinaciones libres', () => {
    expect(activeSavedView(EMPTY_FACETS)).toBe('all');
    expect(activeSavedView(applySavedView('deuda'))).toBe('deuda');
    expect(activeSavedView(applySavedView('vip'))).toBe('vip');
    const libre: CustomerFacetState = { ...EMPTY_FACETS, saldo: 'con', estado: 'active' };
    expect(activeSavedView(libre)).toBeNull();
  });
});

describe('activeFacetCount', () => {
  it('suma facetas single + tamaños de los sets multi (la búsqueda no cuenta)', () => {
    const f: CustomerFacetState = {
      ...EMPTY_FACETS,
      search: 'algo',
      estado: 'active',
      saldo: 'con',
      tarifas: new Set(['a', 'b']),
      segmentos: new Set(['VIP']),
    };
    expect(activeFacetCount(f)).toBe(5);
  });
});

describe('searchBase', () => {
  it('devuelve todas las filas sin búsqueda y filtra por texto si la hay', () => {
    const rows = mergeCustomers(
      [
        customer(),
        customer({
          id: 'c2',
          name: 'Otro',
          nif: 'Z99',
          email: 'z@otro.es',
          phone: '',
          address: '',
          salesRep: null,
        }),
      ],
      [],
    );
    expect(searchBase(rows, '')).toHaveLength(2);
    expect(searchBase(rows, 'llorente')).toHaveLength(1);
  });
});

describe('formatters', () => {
  it('daysAgo cuenta días enteros', () => {
    expect(daysAgo('2026-06-16T12:00:00Z', NOW)).toBe(10);
  });

  it('relOrderDate cubre sin pedidos / hoy / relativo', () => {
    expect(relOrderDate(null, NOW)).toBe('Sin pedidos');
    expect(relOrderDate('2026-06-26T12:00:00Z', NOW)).toBe('hoy');
    expect(relOrderDate('2026-06-16T12:00:00Z', NOW)).toBe('hace 10 d');
  });

  it('initials toma 1-2 iniciales ignorando símbolos', () => {
    expect(initials('Distribuciones Llorente')).toBe('DL');
    expect(initials('Farmacia')).toBe('F');
  });

  it('paymentTermsLabel: contado vs días', () => {
    expect(paymentTermsLabel(null)).toBe('Contado');
    expect(paymentTermsLabel(0)).toBe('Contado');
    expect(paymentTermsLabel(60)).toBe('60 días');
  });

  it('tagTone clasifica los segmentos conocidos', () => {
    expect(tagTone('VIP')).toBe('vip');
    expect(tagTone('Riesgo')).toBe('risk');
    expect(tagTone('Nuevo')).toBe('new');
    expect(tagTone('Retail')).toBe('neutral');
  });

  it('balanceTone: vencido=danger, saldo=plain, al día=muted', () => {
    const base = mergeCustomers([customer()], [ledger()])[0]!;
    expect(balanceTone(base)).toBe('danger');
    expect(balanceTone({ ...base, overdue: 0 })).toBe('plain');
    expect(balanceTone({ ...base, overdue: 0, balance: 0 })).toBe('muted');
  });
});
