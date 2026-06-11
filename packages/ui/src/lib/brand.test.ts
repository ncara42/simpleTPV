import { afterEach, describe, expect, it } from 'vitest';

import { applyBrandColor, relativeLuminance } from './brand.js';

const root = () => document.documentElement.style;

describe('applyBrandColor (U-08)', () => {
  afterEach(() => applyBrandColor(null));

  it('aplica el color a los tokens de acento y acción', () => {
    applyBrandColor('#aa00ff');
    expect(root().getPropertyValue('--ui-brand')).toBe('#aa00ff');
    expect(root().getPropertyValue('--ui-primary')).toBe('#aa00ff');
    expect(root().getPropertyValue('--ui-primary-hover')).toContain('color-mix');
  });

  it('elige el texto del botón por contraste: blanco sobre marca oscura, oscuro sobre clara', () => {
    applyBrandColor('#0a356b'); // azul oscuro
    expect(root().getPropertyValue('--ui-primary-fg')).toBe('#ffffff');
    applyBrandColor('#ffd83d'); // amarillo claro
    expect(root().getPropertyValue('--ui-primary-fg')).toBe('#18181a');
  });

  it('null restaura el tema por defecto (sin overrides inline)', () => {
    applyBrandColor('#aa00ff');
    applyBrandColor(null);
    expect(root().getPropertyValue('--ui-brand')).toBe('');
    expect(root().getPropertyValue('--ui-primary-fg')).toBe('');
  });

  it('relativeLuminance: negro 0, blanco 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});
