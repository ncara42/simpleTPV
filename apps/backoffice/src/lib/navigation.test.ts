import { describe, expect, it } from 'vitest';

import type { Tab } from './nav.js';
import {
  NAV_GROUPS,
  NAV_NODES,
  type NavTarget,
  nodeOf,
  parseStoreParam,
  pathToTab,
  serializeStoreParam,
  singleStoreParam,
  tabToPath,
  targetToHref,
} from './navigation.js';

describe('navigation — catálogo único', () => {
  it('cada nodo tiene una ruta única', () => {
    const paths = NAV_NODES.map((n) => n.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('cada nodo tiene un id único', () => {
    const ids = NAV_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el dashboard vive en la raíz', () => {
    expect(tabToPath('dashboard')).toBe('/');
  });

  it('todo grupo declarado en un nodo existe en NAV_GROUPS', () => {
    const groupIds = new Set(NAV_GROUPS.map((g) => g.id));
    for (const node of NAV_NODES) {
      if (node.group) expect(groupIds.has(node.group)).toBe(true);
    }
  });

  // S-27: los 4 dominios de la piedra angular son entradas DIRECTAS (sin grupo),
  // tras Dashboard y en orden por frecuencia (Ventas → Catálogo → Inventario →
  // Proveedores).
  it('S-27: los 4 dominios directos no tienen grupo y van en orden tras Dashboard', () => {
    const directDomains = ['sales', 'catalog', 'stock', 'suppliers'] as const;
    for (const id of directDomains) {
      expect(nodeOf(id)?.group).toBeUndefined();
    }
    const visibleOrder = NAV_NODES.filter((n) => !n.hidden).map((n) => n.id);
    expect(visibleOrder.slice(0, 5)).toEqual(['dashboard', ...directDomains]);
  });

  // S-12: el término visible del dominio de existencias es 'Inventario'; 'stock'
  // queda como sinónimo oculto (no como label).
  it('S-12: la entrada de existencias usa el label "Inventario" con "stock" como sinónimo', () => {
    const node = nodeOf('stock');
    expect(node?.label).toBe('Inventario');
    expect(node?.synonyms).toContain('stock');
  });
});

describe('tabToPath / pathToTab — ida y vuelta', () => {
  it('round-trip estable para todas las pestañas', () => {
    for (const node of NAV_NODES) {
      expect(pathToTab(tabToPath(node.id))).toBe(node.id);
    }
  });

  it('pathToTab ignora query string y hash', () => {
    expect(pathToTab('/stock?store=abc')).toBe('stock');
    expect(pathToTab('/catalog#top')).toBe('catalog');
  });

  it('pathToTab normaliza la barra final', () => {
    expect(pathToTab('/stock/')).toBe('stock');
    expect(pathToTab('/')).toBe('dashboard');
  });

  it('pathToTab devuelve null para rutas desconocidas', () => {
    expect(pathToTab('/no-existe')).toBeNull();
  });

  it('tabToPath cae a la raíz para un id desconocido', () => {
    expect(tabToPath('zzz' as Tab)).toBe('/');
  });
});

describe('nodeOf', () => {
  it('devuelve el nodo por id', () => {
    expect(nodeOf('b2b')?.flag).toBe('b2b');
    expect(nodeOf('notifications')?.hidden).toBe(true);
  });
});

describe('targetToHref — destino extensible', () => {
  it('Tab simple → ruta canónica', () => {
    expect(targetToHref('stock')).toBe('/stock');
  });

  it('string con barra → path crudo intacto', () => {
    expect(targetToHref('/stock?store=a')).toBe('/stock?store=a');
  });

  it('objeto con section → ?section=', () => {
    expect(targetToHref({ tab: 'b2b', section: 'pricelists' })).toBe('/b2b?section=pricelists');
  });

  it('objeto con query arbitraria', () => {
    const target: NavTarget = { tab: 'stock', query: { store: 'a', q: 'leche' } };
    const href = targetToHref(target);
    expect(href.startsWith('/stock?')).toBe(true);
    expect(href).toContain('store=a');
    expect(href).toContain('q=leche');
  });
});

describe('helpers del search param de tienda', () => {
  it('parseStoreParam — single', () => {
    expect(parseStoreParam('abc')).toEqual(['abc']);
  });

  it('parseStoreParam — lista a,b', () => {
    expect(parseStoreParam('a,b')).toEqual(['a', 'b']);
  });

  it('parseStoreParam — vacío/ausente → []', () => {
    expect(parseStoreParam(null)).toEqual([]);
    expect(parseStoreParam('')).toEqual([]);
    expect(parseStoreParam(' , ')).toEqual([]);
  });

  it('singleStoreParam — primer id o null', () => {
    expect(singleStoreParam('a,b')).toBe('a');
    expect(singleStoreParam(null)).toBeNull();
  });

  it('serializeStoreParam — round-trip con parseStoreParam', () => {
    expect(serializeStoreParam(['a', 'b'])).toBe('a,b');
    expect(parseStoreParam(serializeStoreParam(['a', 'b']))).toEqual(['a', 'b']);
    expect(serializeStoreParam([])).toBe('');
  });
});
