import { describe, expect, it } from 'vitest';

import { toolLabel } from './toolLabels.js';

describe('toolLabel', () => {
  it('traduce una tool de datos conocida a frase legible', () => {
    expect(toolLabel('sales_kpis')).toBe('Consultó los KPIs de ventas');
  });

  it('traduce una op de lienzo conocida', () => {
    expect(toolLabel('add_widget')).toBe('Añadió un widget');
  });

  it('mapea las nuevas consultas de datos (sin nombre crudo)', () => {
    expect(toolLabel('stockout_kpis')).toBe('Consultó las roturas de stock');
    expect(toolLabel('margin_kpis')).toBe('Consultó los márgenes');
  });

  it('para tools desconocidas devuelve un genérico, NUNCA el nombre técnico crudo', () => {
    const label = toolLabel('tool_inventada');
    expect(label).toBe('Consultó datos');
    expect(label).not.toContain('tool_inventada');
    expect(label).not.toContain('_');
  });
});
