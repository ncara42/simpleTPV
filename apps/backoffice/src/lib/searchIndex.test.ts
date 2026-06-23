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

// S-21/P127: la entrada "Tarifas B2B" debe aterrizar en la SUBSECCIÓN Tarifas del
// mayorista (no en la subtab Clientes por defecto). El destino enriquecido viaja en
// `params` (`{ section: 'pricelists' }`), que el palette traduce a `/b2b?section=pricelists`.
describe('searchIndex — Tarifas B2B aterriza en la subsección Tarifas (S-21)', () => {
  const findEntry = (query: string) =>
    searchFunctions(query, 20).find((e) => e.label === 'Tarifas B2B');

  it('la entrada "Tarifas B2B" lleva params { section: "pricelists" } a la Tab b2b', () => {
    const entry = findEntry('tarifas b2b');
    expect(entry).toBeDefined();
    expect(entry?.tab).toBe('b2b');
    expect(entry?.params).toEqual({ section: 'pricelists' });
  });

  it.each([['tarifas b2b'], ['precios mayorista'], ['lista de precios'], ['tarifa mayorista']])(
    'es localizable por el sinónimo «%s» y conserva el destino de subsección',
    (query) => {
      const entry = findEntry(query);
      expect(entry).toBeDefined();
      expect(entry?.params?.section).toBe('pricelists');
    },
  );

  it('"Clientes B2B" sigue SIN params (navegación clásica por Tab, subtab por defecto)', () => {
    const customers = searchFunctions('clientes b2b', 20).find((e) => e.label === 'Clientes B2B');
    expect(customers).toBeDefined();
    expect(customers?.params).toBeUndefined();
  });
});
