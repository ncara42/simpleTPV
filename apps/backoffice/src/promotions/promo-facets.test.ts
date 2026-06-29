import { describe, expect, it } from 'vitest';

import type { Promotion } from '../lib/promotions.js';
import {
  activeSavedView,
  applySavedView,
  condClause,
  condShort,
  dateRange,
  daysBetween,
  daysTo,
  discPhrase,
  discShort,
  EMPTY_PROMO_FACETS,
  filterPromotions,
  isExpiringSoon,
  plural,
  type PromoFacetState,
  searchBase,
  sortPromotions,
  statusChips,
} from './promo-facets.js';

// Fecha fija (coincide con la del diseño) para que estado/vigencia sean deterministas.
const TODAY = '2026-06-27';

function promo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'p1',
    name: 'Rebajas de verano',
    conditionType: 'min_ticket',
    threshold: 40,
    discountType: 'percent',
    discountValue: 20,
    startDate: '2026-06-01',
    endDate: '2026-07-31',
    active: true,
    ...overrides,
  };
}

function facets(overrides: Partial<PromoFacetState> = {}): PromoFacetState {
  return { ...EMPTY_PROMO_FACETS, ...overrides };
}

const activa = promo({ id: 'a', name: 'Activa', startDate: '2026-06-01', endDate: '2026-07-31' });
const programada = promo({
  id: 'b',
  name: 'Programada',
  startDate: '2026-11-20',
  endDate: '2026-11-30',
});
const pausada = promo({ id: 'c', name: 'Pausada', active: false });
const expirada = promo({
  id: 'd',
  name: 'Expirada',
  startDate: '2026-01-01',
  endDate: '2026-02-28',
});

describe('filterPromotions', () => {
  it('filtra por estado efectivo (activa/programada/pausada/expirada)', () => {
    const rows = [activa, programada, pausada, expirada];

    expect(filterPromotions(rows, facets({ estados: new Set(['activa']) }), TODAY)).toEqual([
      activa,
    ]);
    expect(
      filterPromotions(rows, facets({ estados: new Set(['programada']) }), TODAY).map((p) => p.id),
    ).toEqual(['b']);
    expect(filterPromotions(rows, facets({ estados: new Set(['pausada']) }), TODAY)).toEqual([
      pausada,
    ]);
  });

  it('filtra por condición y por tipo de descuento', () => {
    const qty = promo({ id: 'q', conditionType: 'min_qty' });
    const amount = promo({ id: 'm', discountType: 'amount' });
    const rows = [activa, qty, amount];

    expect(
      filterPromotions(rows, facets({ condiciones: new Set(['min_qty']) }), TODAY).map((p) => p.id),
    ).toEqual(['q']);
    expect(
      filterPromotions(rows, facets({ descuentos: new Set(['amount']) }), TODAY).map((p) => p.id),
    ).toEqual(['m']);
  });

  it('la búsqueda filtra por nombre, insensible a mayúsculas', () => {
    const rows = [activa, programada];
    expect(filterPromotions(rows, facets({ search: 'progr' }), TODAY)).toEqual([programada]);
  });

  it('«vencen pronto» deja solo activas que terminan en ≤30 días', () => {
    const soon = promo({ id: 's', startDate: '2026-06-01', endDate: '2026-07-10' });
    const far = promo({ id: 'f', startDate: '2026-06-01', endDate: '2026-09-30' });
    const rows = [soon, far, programada];
    expect(filterPromotions(rows, facets({ soon: true }), TODAY).map((p) => p.id)).toEqual(['s']);
  });
});

describe('isExpiringSoon', () => {
  it('es cierto solo para activas dentro de la ventana de 30 días', () => {
    expect(isExpiringSoon(promo({ endDate: '2026-07-15' }), TODAY)).toBe(true);
    expect(isExpiringSoon(promo({ endDate: '2026-09-15' }), TODAY)).toBe(false);
    expect(isExpiringSoon(expirada, TODAY)).toBe(false);
    expect(isExpiringSoon(pausada, TODAY)).toBe(false);
  });
});

describe('statusChips', () => {
  it('cuenta activas, programadas e inactivas (pausada + expirada)', () => {
    const chips = statusChips([activa, programada, pausada, expirada], TODAY);
    expect(chips).toEqual({ activa: 1, programada: 1, inactiva: 2 });
  });
});

describe('sortPromotions', () => {
  it('por estado: activa → programada → pausada → expirada', () => {
    const rows = [expirada, pausada, programada, activa];
    expect(sortPromotions(rows, 'estado', TODAY).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('por vigencia: el fin más próximo primero', () => {
    const soon = promo({ id: 's', endDate: '2026-07-05' });
    const later = promo({ id: 'l', endDate: '2026-12-31' });
    expect(sortPromotions([later, soon], 'vigencia', TODAY).map((p) => p.id)).toEqual(['s', 'l']);
  });
});

describe('vistas guardadas', () => {
  it('applySavedView/activeSavedView hacen ida y vuelta', () => {
    expect(activeSavedView(applySavedView('activas'))).toBe('activas');
    expect(activeSavedView(applySavedView('vencen'))).toBe('vencen');
    expect(activeSavedView(applySavedView('all'))).toBe('all');
  });

  it('una combinación libre de facetas no corresponde a ninguna vista', () => {
    expect(activeSavedView(facets({ condiciones: new Set(['min_qty']) }))).toBeNull();
  });
});

describe('fechas', () => {
  it('daysTo es negativo en el pasado y positivo en el futuro', () => {
    expect(daysTo('2026-06-30', TODAY)).toBe(3);
    expect(daysTo('2026-06-24', TODAY)).toBe(-3);
  });

  it('daysBetween cuenta los días entre dos fechas', () => {
    expect(daysBetween('2026-06-01', '2026-06-30')).toBe(29);
  });
});

describe('formatters de dominio', () => {
  it('condShort / condClause según el tipo de condición', () => {
    expect(condShort({ conditionType: 'min_qty', threshold: 3 })).toBe('≥ 3 ud');
    expect(condShort({ conditionType: 'min_ticket', threshold: 40 })).toBe('≥ 40 € ticket');
    expect(condClause({ conditionType: 'min_qty', threshold: 3 })).toBe(
      'El ticket lleva 3 o más productos',
    );
  });

  it('discShort / discPhrase según el tipo de descuento', () => {
    expect(discShort({ discountType: 'percent', discountValue: 20 })).toBe('−20%');
    expect(discShort({ discountType: 'amount', discountValue: 5 })).toBe('−5 €');
    expect(discPhrase({ discountType: 'percent', discountValue: 20 })).toBe('20% de descuento');
  });

  it('dateRange omite el año del inicio cuando coincide con el del fin', () => {
    // El punto tras el mes abreviado depende del ICU del runtime; toleramos ambas formas.
    expect(dateRange('2026-06-01', '2026-07-31')).toMatch(/^1 jun\.? – 31 jul\.? 2026$/);
  });

  it('plural concuerda singular/plural sobre el valor absoluto', () => {
    expect(plural(1, 'día', 'días')).toBe('1 día');
    expect(plural(5, 'día', 'días')).toBe('5 días');
    expect(plural(-3, 'día', 'días')).toBe('3 días');
  });
});

describe('searchBase', () => {
  it('devuelve todo cuando la búsqueda está vacía', () => {
    const rows = [activa, programada];
    expect(searchBase(rows, '   ')).toHaveLength(2);
  });
});
