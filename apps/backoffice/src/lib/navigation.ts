// F0 — Fuente única de navegación del backoffice (id ↔ path ↔ label ↔ grupo).
//
// DATOS PUROS (sin JSX): los iconos se mapean en el shell (`App.tsx`), para que la
// fuente siga siendo testeable y desacoplada de lucide/React. `tabToPath`/`pathToTab`
// permiten derivar la pestaña activa de la URL (react-router) sin cambiar el DOM.
//
// IMPORTANTE: el orden, la membresía de grupos y los labels son ESPEJO 1:1 de
// `ALL_NAV`/`NAV_GROUPS` de `App.tsx` (shell flotante actual). NO se adopta el
// re-grupado S-27 (catalog/stock/sales directos): mantener la agrupación actual deja
// `navTo`/`NAV_GROUP_OF` de los E2E como espejo válido. `nav.ts` (tipo `Tab`,
// `switchApp`) y `searchIndex.ts` (índice del buscador) siguen siendo la otra fuente;
// este fichero NO los reemplaza, solo aporta el mapeo id↔path↔label.

import type { Tab } from './nav.js';

export type NavGroupId = 'inventory' | 'commercial' | 'org';

export interface NavGroupMeta {
  id: NavGroupId;
  label: string;
}

/** Shape del nodo de navegación. `flag`/`synonyms`/`hidden` se consumen en fases
 *  posteriores (buscador, menú); en F0 solo importan `id`/`path`/`label`/`group`. */
export interface NavNode {
  id: Tab;
  /** Ruta canónica (sin query). El dashboard vive en `/`. */
  path: string;
  /** Etiqueta visible (menú, título flotante, buscador). */
  label: string;
  /** Grupo del menú al que pertenece. Ausente = entrada directa (dashboard/ayuda). */
  group?: NavGroupId;
  /** Feature flag que condiciona su visibilidad en el menú. */
  flag?: 'b2b' | 'time_clock';
  /** Oculto del menú lateral pero accesible por URL (campana / backend sin UI). */
  hidden?: boolean;
}

/** Grupos del menú (espejo de `NAV_GROUPS` de App.tsx). El icono se asigna en el shell. */
export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: 'inventory', label: 'Catálogo e inventario' },
  { id: 'commercial', label: 'Ventas y clientes' },
  { id: 'org', label: 'Organización' },
] as const;

/** Catálogo único de entradas, en el MISMO orden que `ALL_NAV` de App.tsx. */
export const NAV_NODES: readonly NavNode[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard' },
  {
    id: 'notifications',
    path: '/notifications',
    label: 'Notificaciones',
    group: 'inventory',
    hidden: true,
  },
  // Catálogo e inventario
  // S-02 fase A: una sola entrada de menú "Inventario" monta el shell con vistas
  // segmentadas (Catálogo/Familias/Existencias). Catalog/families/stock conservan su
  // ruta (deep-link + redirección a /inventario) pero salen del menú (hidden).
  { id: 'inventory', path: '/inventario', label: 'Inventario', group: 'inventory' },
  { id: 'catalog', path: '/catalog', label: 'Catálogo', group: 'inventory', hidden: true },
  { id: 'families', path: '/families', label: 'Familias', group: 'inventory', hidden: true },
  { id: 'stock', path: '/stock', label: 'Inventario', group: 'inventory', hidden: true }, // S-12: término único "Inventario"
  { id: 'transfers', path: '/transfers', label: 'Traspasos', group: 'inventory' },
  { id: 'suppliers', path: '/suppliers', label: 'Proveedores', group: 'inventory' },
  // Ventas y clientes
  { id: 'sales', path: '/sales', label: 'Ventas', group: 'commercial' },
  { id: 'b2b', path: '/b2b', label: 'Clientes B2B', group: 'commercial', flag: 'b2b' },
  { id: 'promotions', path: '/promotions', label: 'Promociones', group: 'commercial' },
  // Organización
  { id: 'stores', path: '/stores', label: 'Tiendas', group: 'org' },
  { id: 'users', path: '/users', label: 'Usuarios', group: 'org' },
  {
    id: 'timeclock',
    path: '/timeclock',
    label: 'Control horario',
    group: 'org',
    flag: 'time_clock',
  },
  { id: 'settings', path: '/settings', label: 'Ajustes', group: 'org' },
  { id: 'verifactu', path: '/verifactu', label: 'VeriFactu', group: 'org', hidden: true },
  // Directa
  { id: 'help', path: '/help', label: 'Ayuda' },
] as const;

// Índices derivados (una vez) para lookups O(1).
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
 * Pestaña a la que corresponde un pathname. Ignora query/hash y barra final.
 * Devuelve `null` si la ruta no mapea a ninguna entrada (el caller redirige a `/`).
 */
export function pathToTab(pathname: string): Tab | null {
  const clean = pathname.split(/[?#]/)[0] ?? '/';
  const normalized = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
  return BY_PATH.get(normalized || '/')?.id ?? null;
}

// ── Helpers del search param de tienda (`?store`) — los consume F0c ────────────
// `?store=<id>` (single, compat deep-link actual). SIEMPRE se lee como `string[]`.

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
