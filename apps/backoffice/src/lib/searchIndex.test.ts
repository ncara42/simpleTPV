import { describe, expect, it } from 'vitest';

import { searchFunctions } from './searchIndex.js';

// S-25/P157: la "Comparativa de proveedores" se retiró del buscador a propósito
// (pasa a ser acceso directo: widget del dashboard + deep-link). El buscador NO
// debe ofrecerla ya como resultado. La entrada "Proveedores" se mantiene.
describe('searchIndex — retirada de "Comparativa de proveedores" (S-25/P157)', () => {
  it('ninguna entrada del índice se etiqueta "Comparativa de proveedores"', () => {
    // Una query amplia (alcanza por sinónimos a varias entradas) no debe contener
    // jamás la etiqueta retirada, sea cual sea el término.
    for (const query of ['comparativa', 'comparar precios', 'mejor precio', 'proveedor']) {
      const labels = searchFunctions(query, 50).map((e) => e.label);
      expect(labels).not.toContain('Comparativa de proveedores');
    }
  });

  it('"Proveedores" sigue siendo localizable por sus sinónimos (tarifas/compras)', () => {
    const labels = searchFunctions('tarifas', 12).map((e) => e.label);
    expect(labels).toContain('Proveedores');
  });
});
