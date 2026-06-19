import { describe, expect, it } from 'vitest';

import { toolLabel } from './toolLabels.js';

describe('toolLabel', () => {
  it('traduce una tool de datos conocida a frase legible', () => {
    expect(toolLabel('sales_kpis')).toBe('Consultó los KPIs de ventas');
  });

  it('traduce una op de lienzo conocida', () => {
    expect(toolLabel('add_widget')).toBe('Añadió un widget');
  });

  it('devuelve el nombre crudo como fallback para tools desconocidas', () => {
    expect(toolLabel('tool_inventada')).toBe('tool_inventada');
  });
});
