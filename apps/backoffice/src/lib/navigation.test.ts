import { describe, expect, it } from 'vitest';

import type { Tab } from './nav.js';
import {
  NAV_NODES,
  type NavNode,
  nodeOf,
  parseStoreParam,
  pathToTab,
  serializeStoreParam,
  singleStoreParam,
  tabToPath,
} from './navigation.js';

// Los 16 ids del tipo `Tab` con su slug y label esperados — ESPEJO de ALL_NAV en
// App.tsx. Si App.tsx y navigation.ts se desincronizan (id/label/grupo), este test
// y el page-heading derivado de la URL fallan: es la red de seguridad de la fuente única.
const EXPECTED: ReadonlyArray<[Tab, string, string]> = [
  ['dashboard', '/', 'Dashboard'],
  ['notifications', '/notifications', 'Notificaciones'],
  ['catalog', '/catalog', 'Catálogo'],
  ['families', '/families', 'Familias'],
  ['stock', '/stock', 'Stock'],
  ['transfers', '/transfers', 'Traspasos'],
  ['suppliers', '/suppliers', 'Proveedores'],
  ['sales', '/sales', 'Ventas'],
  ['b2b', '/b2b', 'Clientes B2B'],
  ['promotions', '/promotions', 'Promociones'],
  ['stores', '/stores', 'Tiendas'],
  ['users', '/users', 'Usuarios'],
  ['timeclock', '/timeclock', 'Control horario'],
  ['settings', '/settings', 'Ajustes'],
  ['verifactu', '/verifactu', 'VeriFactu'],
  ['help', '/help', 'Ayuda'],
];

describe('navigation — fuente única id↔path↔label (F0)', () => {
  it('cubre exactamente los 16 ids de Tab, en orden', () => {
    expect(NAV_NODES.map((n) => n.id)).toEqual(EXPECTED.map(([id]) => id));
  });

  it('tabToPath y label coinciden con lo esperado para cada id', () => {
    for (const [id, path, label] of EXPECTED) {
      expect(tabToPath(id)).toBe(path);
      expect(nodeOf(id)?.label).toBe(label);
    }
  });

  it('pathToTab es la inversa de tabToPath (roundtrip de los 16)', () => {
    for (const [id, path] of EXPECTED) {
      expect(pathToTab(path)).toBe(id);
    }
  });

  it('pathToTab ignora query/hash y barra final', () => {
    expect(pathToTab('/stock?store=abc')).toBe('stock');
    expect(pathToTab('/suppliers#top')).toBe('suppliers');
    expect(pathToTab('/users/')).toBe('users');
    expect(pathToTab('/')).toBe('dashboard');
  });

  it('pathToTab devuelve null para rutas desconocidas (el caller cae a /)', () => {
    expect(pathToTab('/no-existe')).toBeNull();
    expect(pathToTab('/stock/extra')).toBeNull();
  });

  it('notifications y verifactu existen como rutas pero están ocultas del menú', () => {
    const hidden = NAV_NODES.filter((n: NavNode) => n.hidden).map((n) => n.id);
    expect(hidden).toEqual(['notifications', 'verifactu']);
    // siguen siendo navegables por URL:
    expect(tabToPath('notifications')).toBe('/notifications');
    expect(pathToTab('/verifactu')).toBe('verifactu');
  });

  it('los flags de feature apuntan a b2b y timeclock', () => {
    expect(nodeOf('b2b')?.flag).toBe('b2b');
    expect(nodeOf('timeclock')?.flag).toBe('time_clock');
  });
});

describe('navigation — helpers del search param de tienda', () => {
  it('parseStoreParam parsea single y lista por comas', () => {
    expect(parseStoreParam(null)).toEqual([]);
    expect(parseStoreParam('')).toEqual([]);
    expect(parseStoreParam('a')).toEqual(['a']);
    expect(parseStoreParam('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('singleStoreParam devuelve el primero o null', () => {
    expect(singleStoreParam('a,b')).toBe('a');
    expect(singleStoreParam(null)).toBeNull();
  });

  it('serializeStoreParam es la inversa (sin vacíos)', () => {
    expect(serializeStoreParam(['a', 'b'])).toBe('a,b');
    expect(serializeStoreParam([])).toBe('');
    expect(serializeStoreParam(['', 'x'])).toBe('x');
  });
});
