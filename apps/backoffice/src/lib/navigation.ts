// F0 — Fuente única de navegación del backoffice (P017/P039).
//
// Catálogo `id ↔ path ↔ label ↔ grupo` del que derivan Sidebar, Breadcrumbs (S-03)
// y buscador (S-06). Sustituye al antiguo `ALL_NAV`/`NAV_GROUPS` de `App.tsx`.
//
// Este fichero es DATOS PUROS (sin JSX): los iconos de cada entrada se mapean en
// el shell (`App.tsx`), para que la fuente única siga siendo testeable y desacoplada
// de lucide/React. F0 es el ÚNICO creador; S-03/S-06/S-11/S-14/S-27/S-02 solo
// EXTIENDEN este fichero (añaden campos/nodos), nunca lo recrean.

import type { Tab } from './nav.js';

/**
 * Shape máximo del nodo de navegación (contrato compartido, fijado en F0). Algunos
 * campos no se consumen hasta planes posteriores pero se declaran ya (YAGNI por
 * contrato): `flag` (feature flag, S-01/S-06), `synonyms` (buscador, S-06),
 * `parent` (rutas anidadas/migas, S-03/S-01/S-21/S-25) y `hidden` (oculto del menú).
 */
export interface NavNode {
  id: Tab;
  /** Ruta canónica (sin query). El dashboard vive en `/`. */
  path: string;
  /** Etiqueta visible (menú, migas, resultados de búsqueda). */
  label: string;
  /** Grupo del menú al que pertenece (ver `NAV_GROUPS`). Vacío = entrada directa. */
  group?: NavGroupId;
  /** Feature flag que condiciona su visibilidad en el menú. */
  flag?: 'b2b' | 'time_clock';
  /** Sinónimos del negocio para el buscador (S-06 los completa). */
  synonyms?: string[];
  /** Nodo padre para rutas anidadas / 3er crumb (lo consumen S-03/S-01/S-21/S-25). */
  parent?: Tab;
  /** Oculto del menú lateral pero accesible por URL (campana, backend sin UI). */
  hidden?: boolean;
}

export type NavGroupId = 'inventory' | 'commercial' | 'org';

export interface NavGroupMeta {
  id: NavGroupId;
  label: string;
}

/**
 * Grupos del menú (D-02/D-09). El icono de cada grupo se asigna en el shell.
 * El orden y los labels los podrá ajustar S-27 (piedra angular) / S-12 (microcopy).
 */
export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: 'inventory', label: 'Catálogo e inventario' },
  { id: 'commercial', label: 'Ventas y clientes' },
  { id: 'org', label: 'Organización' },
] as const;

/**
 * Catálogo único de entradas. El orden es el del menú actual (D-09); S-27 lo
 * reordenará consumiendo esta misma fuente.
 */
export const NAV_NODES: readonly NavNode[] = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    synonyms: ['inicio', 'home', 'resumen', 'kpis', 'paneles', 'metricas'],
  },
  // Catálogo e inventario
  {
    id: 'notifications',
    path: '/notifications',
    label: 'Notificaciones',
    group: 'inventory',
    hidden: true,
    synonyms: ['avisos', 'alertas', 'campana'],
  },
  {
    id: 'catalog',
    path: '/catalog',
    label: 'Catálogo',
    group: 'inventory',
    synonyms: ['productos', 'articulos', 'precios', 'referencias', 'sku'],
  },
  {
    id: 'families',
    path: '/families',
    label: 'Familias',
    group: 'inventory',
    synonyms: ['arquetipos', 'subfamilias', 'arbol', 'categorias'],
  },
  {
    id: 'stock',
    path: '/stock',
    label: 'Stock',
    group: 'inventory',
    synonyms: ['inventario', 'existencias', 'almacen', 'roturas'],
  },
  {
    id: 'transfers',
    path: '/transfers',
    label: 'Traspasos',
    group: 'inventory',
    synonyms: ['traspaso', 'mover stock', 'enviar', 'recepcion'],
  },
  {
    id: 'suppliers',
    path: '/suppliers',
    label: 'Proveedores',
    group: 'inventory',
    synonyms: ['proveedor', 'compras', 'tarifas', 'reponer'],
  },
  // Ventas y clientes
  {
    id: 'sales',
    path: '/sales',
    label: 'Ventas',
    group: 'commercial',
    synonyms: ['ventas', 'tickets', 'facturas', 'historico'],
  },
  {
    id: 'b2b',
    path: '/b2b',
    label: 'Clientes B2B',
    group: 'commercial',
    flag: 'b2b',
    synonyms: ['mayorista', 'clientes', 'tarifas', 'listas de precios', 'pedidos'],
  },
  {
    id: 'promotions',
    path: '/promotions',
    label: 'Promociones',
    group: 'commercial',
    synonyms: ['promocion', 'descuentos', 'ofertas', 'rebajas'],
  },
  // Organización
  {
    id: 'stores',
    path: '/stores',
    label: 'Tiendas',
    group: 'org',
    synonyms: ['tienda', 'local', 'sucursal', 'establecimiento'],
  },
  {
    id: 'users',
    path: '/users',
    label: 'Usuarios',
    group: 'org',
    synonyms: ['usuario', 'empleados', 'personal', 'equipo', 'vendedores'],
  },
  {
    id: 'timeclock',
    path: '/timeclock',
    label: 'Control horario',
    group: 'org',
    flag: 'time_clock',
    synonyms: ['fichajes', 'fichar', 'horario', 'jornada'],
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Ajustes',
    group: 'org',
    synonyms: ['configuracion', 'preferencias', 'tema', 'marca'],
  },
  {
    id: 'verifactu',
    path: '/verifactu',
    label: 'VeriFactu',
    group: 'org',
    hidden: true,
    synonyms: ['facturacion', 'aeat', 'hacienda'],
  },
  // Directas
  { id: 'help', path: '/help', label: 'Ayuda', synonyms: ['ayuda', 'soporte', 'manual', 'guia'] },
] as const;

// Índices derivados (construidos una vez) para lookups O(1).
const BY_ID = new Map<Tab, NavNode>(NAV_NODES.map((n) => [n.id, n]));
const BY_PATH = new Map<string, NavNode>(NAV_NODES.map((n) => [n.path, n]));

/** Nodo por id de pestaña. */
export function nodeOf(tab: Tab): NavNode | undefined {
  return BY_ID.get(tab);
}

/** Ruta canónica de una pestaña. Fallback a `/` si el id fuese desconocido. */
export function tabToPath(tab: Tab): string {
  return BY_ID.get(tab)?.path ?? '/';
}

/**
 * Pestaña a la que corresponde un pathname. Ignora query string. Devuelve `null`
 * si la ruta no mapea a ninguna entrada (el caller redirige a `/`).
 */
export function pathToTab(pathname: string): Tab | null {
  // Normaliza: quita query/hash y barra final (salvo la raíz).
  const clean = pathname.split(/[?#]/)[0] ?? '/';
  const normalized = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
  return BY_PATH.get(normalized || '/')?.id ?? null;
}

/**
 * Destino de navegación extensible (definido en F0 para que S-06/S-21/S-25 lo
 * enriquezcan sin reescribir el contrato). La variante `string` es un path crudo.
 */
export type NavTarget =
  | Tab
  | { tab: Tab; section?: string; query?: Record<string, string> }
  | string;

/**
 * Resuelve un `NavTarget` a una URL (path + query) lista para `navigate()`.
 * - `Tab` → ruta canónica.
 * - `string` → se asume path crudo (se devuelve tal cual).
 * - objeto → ruta de la tab + `?section=` y/o query arbitraria.
 */
export function targetToHref(target: NavTarget): string {
  if (typeof target === 'string') {
    // Path crudo (empieza por `/`) o id de pestaña.
    return target.startsWith('/') ? target : tabToPath(target as Tab);
  }
  const base = tabToPath(target.tab);
  const params = new URLSearchParams(target.query ?? {});
  if (target.section) params.set('section', target.section);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ── Helpers del search param de tienda (`?store`) ──────────────────────────────
// Contrato fijado en F0: `?store=<id>` (single, compat con el deep-link actual) y,
// para multi-tienda (S-14), lista separada por comas `?store=a,b`. SIEMPRE se lee
// como `string[]`; en F0 el id es único (lista de 0 o 1). NO se inventa `storeIds`.

/** Parsea `?store` a una lista de ids (vacía si ausente/blanco). */
export function parseStoreParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** El primer id de `?store` (compat single deep-link) o `null` si no hay. */
export function singleStoreParam(value: string | null | undefined): string | null {
  return parseStoreParam(value)[0] ?? null;
}

/** Serializa una lista de ids al formato `?store=a,b` (cadena vacía si lista vacía). */
export function serializeStoreParam(ids: readonly string[]): string {
  return ids.filter((s) => s.length > 0).join(',');
}
