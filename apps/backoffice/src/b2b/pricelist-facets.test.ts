import { describe, expect, it } from 'vitest';

import type { Customer, CustomerLedgerRow, PriceListDetail, PriceListSummary } from '../lib/b2b.js';
import {
  activeFacetCount,
  activeSavedView,
  applySavedView,
  avgDiscountOf,
  discountLabel,
  EMPTY_FACETS,
  filterPriceLists,
  initials,
  itemDiscount,
  matches,
  mergePriceLists,
  pctSigned,
  type PriceListFacetState,
  type PriceListView,
  productRows,
  searchBase,
  swCode,
  tipoOf,
} from './pricelist-facets.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────
function summary(overrides: Partial<PriceListSummary> = {}): PriceListSummary {
  return {
    id: 's1',
    name: 'Mayorista',
    active: true,
    itemCount: 2,
    customerCount: 1,
    ...overrides,
  };
}

function detail(id: string, items: PriceListDetail['items']): PriceListDetail {
  return { id, name: id, active: true, items };
}

function item(
  productId: string,
  price: string,
  salePrice: string,
): PriceListDetail['items'][number] {
  return { id: `i-${productId}`, productId, price, product: { name: productId, salePrice } };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Farmacia Centro',
    nif: null,
    email: null,
    phone: null,
    address: null,
    priceListId: 's1',
    tags: [],
    paymentTerms: null,
    salesRep: null,
    creditLimit: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function ledger(overrides: Partial<CustomerLedgerRow> = {}): CustomerLedgerRow {
  return {
    customerId: 'c1',
    orderCount: 3,
    lastOrderAt: '2026-06-01T00:00:00Z',
    billed12m: '1000',
    balance: '0',
    overdue: '0',
    ...overrides,
  };
}

function view(overrides: Partial<PriceListView> = {}): PriceListView {
  return {
    id: 's1',
    name: 'Mayorista',
    active: true,
    itemCount: 2,
    customerCount: 1,
    avgDiscount: 0.18,
    tipo: 'descuento',
    billed12m: 1000,
    items: [],
    ...overrides,
  };
}

// ─── Derivaciones ──────────────────────────────────────────────────────────────
describe('itemDiscount / avgDiscountOf / tipoOf', () => {
  it('deriva el descuento de un item respecto a su PVP', () => {
    expect(itemDiscount(item('p1', '8.2', '10'))).toBeCloseTo(0.18, 5);
  });

  it('devuelve null cuando no hay PVP válido', () => {
    expect(itemDiscount(item('p1', '8.2', '0'))).toBeNull();
  });

  it('promedia solo los items con PVP conocido', () => {
    const items = [item('p1', '8', '10'), item('p2', '9', '10'), item('p3', '5', '0')];
    // (0.2 + 0.1) / 2 = 0.15 — el tercero (sin PVP) no cuenta.
    expect(avgDiscountOf(items)).toBeCloseTo(0.15, 5);
  });

  it('clasifica como base cuando el descuento medio es ~0', () => {
    expect(tipoOf([item('p1', '10', '10')])).toBe('base');
    expect(tipoOf([])).toBe('base');
    expect(tipoOf([item('p1', '8', '10')])).toBe('descuento');
  });
});

describe('mergePriceLists', () => {
  it('cruza resumen + detalle + cartera y deriva tipo/descuento/facturado', () => {
    const summaries = [summary({ id: 's1' }), summary({ id: 's2', name: 'PVP', itemCount: 1 })];
    const details = new Map([
      ['s1', detail('s1', [item('p1', '8.2', '10'), item('p2', '16.4', '20')])],
      ['s2', detail('s2', [item('p1', '10', '10')])],
    ]);
    const customers = [
      customer({ id: 'c1', priceListId: 's1' }),
      customer({ id: 'c2', priceListId: 's1' }),
    ];
    const led = [
      ledger({ customerId: 'c1', billed12m: '1000' }),
      ledger({ customerId: 'c2', billed12m: '500' }),
    ];

    const out = mergePriceLists(summaries, details, customers, led);
    const may = out.find((v) => v.id === 's1')!;
    const pvp = out.find((v) => v.id === 's2')!;

    expect(may.tipo).toBe('descuento');
    expect(may.avgDiscount).toBeCloseTo(0.18, 5);
    expect(may.billed12m).toBe(1500); // suma de la cartera de c1 + c2
    expect(pvp.tipo).toBe('base');
    expect(pvp.billed12m).toBe(0); // sin clientes asignados
  });
});

// ─── Filtrado + facetas ──────────────────────────────────────────────────────
describe('matches / filterPriceLists', () => {
  const rows = [
    view({ id: 's1', name: 'Mayorista', tipo: 'descuento', active: true, customerCount: 5 }),
    view({ id: 's2', name: 'PVP', tipo: 'base', active: true, customerCount: 0 }),
    view({ id: 's3', name: 'Promo', tipo: 'descuento', active: false, customerCount: 0 }),
  ];

  it('filtra por estado', () => {
    const f: PriceListFacetState = { ...EMPTY_FACETS, estado: 'inactive' };
    expect(filterPriceLists(rows, f).map((r) => r.id)).toEqual(['s3']);
  });

  it('filtra por tipo (multi)', () => {
    const f: PriceListFacetState = { ...EMPTY_FACETS, tipos: new Set(['base']) };
    expect(filterPriceLists(rows, f).map((r) => r.id)).toEqual(['s2']);
  });

  it('filtra por asignación', () => {
    const f: PriceListFacetState = { ...EMPTY_FACETS, asignacion: 'con' };
    expect(filterPriceLists(rows, f).map((r) => r.id)).toEqual(['s1']);
  });

  it('busca por nombre (case-insensitive)', () => {
    expect(matches(rows[0]!, { ...EMPTY_FACETS, search: 'mayor' })).toBe(true);
    expect(matches(rows[1]!, { ...EMPTY_FACETS, search: 'mayor' })).toBe(false);
  });
});

describe('searchBase', () => {
  it('reduce por texto antes de contar facetas', () => {
    const rows = [view({ name: 'Mayorista' }), view({ id: 's2', name: 'Distribuidor' })];
    expect(searchBase(rows, 'dist').map((r) => r.name)).toEqual(['Distribuidor']);
    expect(searchBase(rows, '')).toHaveLength(2);
  });
});

describe('vistas guardadas', () => {
  it('activeFacetCount cuenta estado + asignación + tipos', () => {
    expect(activeFacetCount(EMPTY_FACETS)).toBe(0);
    expect(
      activeFacetCount({
        ...EMPTY_FACETS,
        estado: 'active',
        tipos: new Set(['base', 'descuento']),
      }),
    ).toBe(3);
  });

  it('applySavedView ⇄ activeSavedView son consistentes', () => {
    for (const id of ['all', 'activas', 'conclientes', 'sinclientes', 'inactivas'] as const) {
      expect(activeSavedView(applySavedView(id))).toBe(id);
    }
  });
});

// ─── Formatters ──────────────────────────────────────────────────────────────
describe('formatters', () => {
  it('discountLabel', () => {
    expect(discountLabel(0.18)).toBe('−18%');
    expect(discountLabel(0)).toBe('—');
  });

  it('swCode toma hasta 3 alfanuméricos en mayúscula', () => {
    expect(swCode('Mayorista')).toBe('MAY');
    expect(swCode('Mayorista −10%')).toBe('MAY');
    expect(swCode('PVP')).toBe('PVP');
    expect(swCode('')).toBe('·');
  });

  it('initials toma 1-2 iniciales', () => {
    expect(initials('Farmacia Centro')).toBe('FC');
    expect(initials('Llorente')).toBe('L');
  });

  it('pctSigned añade signo', () => {
    expect(pctSigned(-0.18)).toBe('−18%');
    expect(pctSigned(0.05)).toBe('+5%');
    expect(pctSigned(0)).toBe('0%');
  });

  it('productRows ordena por nombre y deriva delta', () => {
    const v = view({ items: [item('Zumo', '8', '10'), item('Agua', '9', '10')] });
    const rows = productRows(v);
    expect(rows.map((r) => r.name)).toEqual(['Agua', 'Zumo']);
    expect(rows[0]!.delta).toBeCloseTo(-0.1, 5);
  });
});
