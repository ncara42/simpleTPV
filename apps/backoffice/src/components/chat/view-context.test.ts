import { describe, expect, it } from 'vitest';

import type { Tab } from '../../lib/nav.js';
import { viewContextFor } from './view-context.js';

// Todas las pestañas del shell (espejo de `Tab` en lib/nav.ts). Si se añade una vista nueva, este
// array y `VIEW_META` deben crecer juntos; el test de cobertura lo verifica.
const ALL_TABS: Tab[] = [
  'dashboard',
  'notifications',
  'catalog',
  'families',
  'stock',
  'transfers',
  'promotions',
  'users',
  'timeclock',
  'stores',
  'sales',
  'suppliers',
  'verifactu',
  'b2b',
  'settings',
  'help',
];

describe('viewContextFor', () => {
  it('da saludo, etiqueta y sugerencias propios de cada vista', () => {
    const sales = viewContextFor('sales');
    expect(sales.id).toBe('sales');
    expect(sales.label).toBe('Ventas');
    expect(sales.greeting).toBe('¿En qué te ayudo con las ventas?');
    expect(sales.suggestions.length).toBeGreaterThan(0);

    const dashboard = viewContextFor('dashboard');
    expect(dashboard.greeting).toBe('¿En qué te ayudo con el dashboard?');
  });

  it('cada vista distingue su saludo (no se queda el del dashboard)', () => {
    expect(viewContextFor('stock').greeting).toContain('stock');
    expect(viewContextFor('stock').greeting).not.toContain('dashboard');
    expect(viewContextFor('users').greeting).toContain('usuarios');
  });

  it('cubre TODAS las pestañas con datos no vacíos', () => {
    for (const tab of ALL_TABS) {
      const ctx = viewContextFor(tab);
      expect(ctx.id).toBe(tab);
      expect(ctx.label.trim().length).toBeGreaterThan(0);
      expect(ctx.greeting.trim().length).toBeGreaterThan(0);
      expect(ctx.suggestions.length).toBeGreaterThanOrEqual(3);
      // Las sugerencias no deben venir vacías.
      for (const s of ctx.suggestions) expect(s.trim().length).toBeGreaterThan(0);
    }
  });
});
