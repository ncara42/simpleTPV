import { describe, expect, it } from 'vitest';

import type { SalesViewRow } from '../lib/admin.js';
import {
  avatarOf,
  cobroStatusOf,
  cobroTotals,
  computeSalesFacets,
  computeSavedViews,
  customerOf,
  EMPTY_SALES_FACETS,
  filterSales,
  hasActiveFilters,
  type SalesFacetState,
  sortSalesByDate,
  toggleInSet,
} from './sales-facets.js';

const TODAY = '2026-06-26';

// Construye una fila del ledger con valores por defecto sobreescribibles.
function row(over: Partial<SalesViewRow> = {}): SalesViewRow {
  return {
    id: over.id ?? 'sale-1',
    ticketNumber: '2001',
    createdAt: '2026-06-26T10:00:00Z',
    total: '100',
    paymentMethod: 'CARD',
    status: 'COMPLETED',
    storeId: 'st1',
    customerName: null,
    channel: 'TPV',
    paymentStatus: 'PAID',
    dueDate: null,
    paidAt: '2026-06-26T10:00:00Z',
    storeName: 'Madrid · Goya',
    sellerId: '',
    sellerName: 'Marta Ruiz',
    familyId: '',
    familyName: '',
    lines: 0,
    ...over,
  };
}

describe('cobroStatusOf', () => {
  it('una venta anulada es void aunque esté pagada', () => {
    expect(cobroStatusOf(row({ status: 'VOIDED', paymentStatus: 'PAID' }), TODAY)).toBe('void');
  });

  it('PAID → paid', () => {
    expect(cobroStatusOf(row({ paymentStatus: 'PAID' }), TODAY)).toBe('paid');
  });

  it('PENDING con vencimiento futuro → pending', () => {
    const r = row({ paymentStatus: 'PENDING', dueDate: '2026-07-10' });
    expect(cobroStatusOf(r, TODAY)).toBe('pending');
  });

  it('PENDING con vencimiento pasado → overdue', () => {
    const r = row({ paymentStatus: 'PENDING', dueDate: '2026-06-20' });
    expect(cobroStatusOf(r, TODAY)).toBe('overdue');
  });

  it('PENDING sin vencimiento → pending (no vencida)', () => {
    expect(cobroStatusOf(row({ paymentStatus: 'PENDING', dueDate: null }), TODAY)).toBe('pending');
  });
});

describe('customerOf / avatarOf', () => {
  it('usa el nombre del destinatario F1 si está presente', () => {
    const r = row({ customerName: 'Obrador San Blas', channel: 'B2B' });
    expect(customerOf(r)).toBe('Obrador San Blas');
    expect(avatarOf(r).initials).toBe('OS');
    expect(avatarOf(r).tone).toBeGreaterThanOrEqual(0);
  });

  it('venta directa sin cliente → «Venta directa» con avatar VD neutro', () => {
    const r = row({ customerName: null, channel: 'TPV' });
    expect(customerOf(r)).toBe('Venta directa');
    expect(avatarOf(r)).toEqual({ initials: 'VD', tone: -1 });
  });

  it('venta online sin cliente → «Venta online» con avatar VO', () => {
    const r = row({ customerName: null, channel: 'ONLINE' });
    expect(customerOf(r)).toBe('Venta online');
    expect(avatarOf(r).initials).toBe('VO');
  });
});

describe('filterSales', () => {
  const rows = [
    row({ id: 'a', paymentStatus: 'PAID', channel: 'TPV', sellerName: 'Marta Ruiz' }),
    row({
      id: 'b',
      paymentStatus: 'PENDING',
      dueDate: '2026-07-10',
      channel: 'B2B',
      customerName: 'Bar Quintana',
    }),
    row({
      id: 'c',
      paymentStatus: 'PENDING',
      dueDate: '2026-06-20',
      channel: 'B2B',
      customerName: 'Obrador San Blas',
    }),
    row({ id: 'd', status: 'VOIDED', channel: 'ONLINE' }),
  ];

  it('la vista «overdue» deja solo las vencidas', () => {
    const out = filterSales(rows, 'overdue', EMPTY_SALES_FACETS, '', TODAY);
    expect(out.map((r) => r.id)).toEqual(['c']);
  });

  it('faceta de canal B2B deja las dos B2B', () => {
    const facets: SalesFacetState = { ...EMPTY_SALES_FACETS, channel: new Set(['B2B']) };
    const out = filterSales(rows, 'all', facets, '', TODAY);
    expect(out.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });

  it('búsqueda por nombre de cliente', () => {
    const out = filterSales(rows, 'all', EMPTY_SALES_FACETS, 'obrador', TODAY);
    expect(out.map((r) => r.id)).toEqual(['c']);
  });
});

describe('sortSalesByDate', () => {
  const rows = [
    row({ id: 'med', createdAt: '2026-06-26T12:00:00Z' }),
    row({ id: 'old', createdAt: '2026-06-26T08:00:00Z' }),
    row({ id: 'new', createdAt: '2026-06-26T20:00:00Z' }),
  ];

  it('desc deja la más reciente primero', () => {
    expect(sortSalesByDate(rows, 'desc').map((r) => r.id)).toEqual(['new', 'med', 'old']);
  });

  it('asc deja la más antigua primero', () => {
    expect(sortSalesByDate(rows, 'asc').map((r) => r.id)).toEqual(['old', 'med', 'new']);
  });

  it('es inmutable: no muta el array de entrada', () => {
    const original = rows.map((r) => r.id);
    sortSalesByDate(rows, 'asc');
    expect(rows.map((r) => r.id)).toEqual(original);
  });
});

describe('cobroTotals', () => {
  it('suma por estado y excluye anuladas', () => {
    const rows = [
      row({ total: '100', paymentStatus: 'PAID' }),
      row({ total: '50', paymentStatus: 'PENDING', dueDate: '2026-07-10' }),
      row({ total: '30', paymentStatus: 'PENDING', dueDate: '2026-06-20' }),
      row({ total: '999', status: 'VOIDED' }),
    ];
    expect(cobroTotals(rows, TODAY)).toEqual({ paid: 100, pending: 50, overdue: 30 });
  });
});

describe('computeSavedViews / computeSalesFacets', () => {
  const rows = [
    row({ paymentStatus: 'PAID' }),
    row({ paymentStatus: 'PAID' }),
    row({ paymentStatus: 'PENDING', dueDate: '2026-07-10' }),
    row({ paymentStatus: 'PENDING', dueDate: '2026-06-20' }),
    row({ status: 'VOIDED' }),
  ];

  it('las vistas cuentan correctamente', () => {
    const views = computeSavedViews(rows, TODAY);
    expect(views.find((v) => v.id === 'all')?.count).toBe(5);
    expect(views.find((v) => v.id === 'pending')?.count).toBe(1);
    expect(views.find((v) => v.id === 'overdue')?.count).toBe(1);
    expect(views.find((v) => v.id === 'void')?.count).toBe(1);
  });

  it('la faceta de cobro lista los estados presentes con recuentos', () => {
    const groups = computeSalesFacets(rows, TODAY);
    const cobro = groups.find((g) => g.key === 'cobro');
    expect(cobro?.options.find((o) => o.key === 'paid')?.count).toBe(2);
    expect(cobro?.options.find((o) => o.key === 'overdue')?.count).toBe(1);
  });
});

describe('helpers', () => {
  it('toggleInSet añade y quita de forma inmutable', () => {
    const a = toggleInSet(new Set<string>(), 'x');
    expect([...a]).toEqual(['x']);
    const b = toggleInSet(a, 'x');
    expect([...b]).toEqual([]);
  });

  it('hasActiveFilters detecta vista, búsqueda o facetas', () => {
    expect(hasActiveFilters('all', EMPTY_SALES_FACETS, '')).toBe(false);
    expect(hasActiveFilters('overdue', EMPTY_SALES_FACETS, '')).toBe(true);
    expect(hasActiveFilters('all', EMPTY_SALES_FACETS, 'foo')).toBe(true);
    expect(hasActiveFilters('all', { ...EMPTY_SALES_FACETS, store: new Set(['x']) }, '')).toBe(
      true,
    );
  });
});
