// U-06: índice estático de la búsqueda de funciones del header. Cada entrada es
// una FUNCIÓN del backoffice (page o acción con destino) con sinónimos del
// vocabulario del negocio. La búsqueda navega: no busca datos, busca funciones.

import type { Tab } from './nav.js';

export interface SearchEntry {
  /** Etiqueta visible en resultados. */
  label: string;
  /** Dónde vive la función. */
  tab: Tab;
  /** Texto secundario del resultado (grupo o aclaración). */
  hint: string;
  /** Sinónimos y términos del negocio que deben encontrarla. */
  synonyms: string[];
}

const SEARCH_INDEX: SearchEntry[] = [
  {
    label: 'Dashboard',
    tab: 'dashboard',
    hint: 'Vista general',
    synonyms: ['inicio', 'resumen', 'kpis', 'paneles'],
  },
  {
    label: 'Catálogo',
    tab: 'catalog',
    hint: 'Catálogo e inventario',
    synonyms: ['productos', 'articulos', 'precios', 'nuevo producto', 'importar csv'],
  },
  {
    label: 'Familias',
    tab: 'families',
    hint: 'Catálogo e inventario',
    synonyms: ['arquetipos', 'subfamilias', 'arbol', 'categorias'],
  },
  {
    label: 'Stock',
    tab: 'stock',
    hint: 'Catálogo e inventario',
    synonyms: ['existencias', 'inventario', 'roturas', 'ajuste', 'avisos'],
  },
  {
    label: 'Traspasos',
    tab: 'transfers',
    hint: 'Catálogo e inventario',
    synonyms: ['transferencias', 'mover stock', 'envios entre tiendas'],
  },
  {
    label: 'Proveedores',
    tab: 'suppliers',
    hint: 'Catálogo e inventario',
    synonyms: ['tarifas', 'pedidos de compra', 'compras', 'comparativa', 'reponer'],
  },
  {
    label: 'Ventas',
    tab: 'sales',
    hint: 'Ventas y clientes',
    synonyms: ['historial', 'tickets', 'facturacion', 'exportar ventas', 'devoluciones'],
  },
  {
    label: 'Clientes B2B',
    tab: 'b2b',
    hint: 'Ventas y clientes',
    synonyms: ['mayorista', 'b2b', 'clientes', 'tarifas b2b', 'pedidos b2b'],
  },
  {
    label: 'Promociones',
    tab: 'promotions',
    hint: 'Ventas y clientes',
    synonyms: ['descuentos', 'ofertas', 'campañas'],
  },
  {
    label: 'Tiendas',
    tab: 'stores',
    hint: 'Organización',
    synonyms: ['locales', 'ubicaciones', 'estado operativo', 'dispositivos', 'token de fichaje'],
  },
  {
    label: 'Usuarios',
    tab: 'users',
    hint: 'Organización',
    synonyms: ['empleados', 'equipo', 'roles', 'pin'],
  },
  {
    label: 'Control horario',
    tab: 'timeclock',
    hint: 'Organización',
    synonyms: ['fichajes', 'horas', 'jornada', 'fichar'],
  },
  {
    label: 'Ayuda',
    tab: 'help',
    hint: 'Soporte y FAQ',
    synonyms: ['soporte', 'faq', 'contacto', 'documentacion'],
  },
  {
    label: 'Integraciones · Claves API',
    tab: 'help',
    hint: 'Dentro de Ayuda',
    synonyms: ['api keys', 'claves', 'integracion', 'token api'],
  },
];

const normalize = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Filtra el índice por término (sin acentos ni mayúsculas), label o sinónimos. */
export function searchFunctions(query: string, limit = 8): SearchEntry[] {
  const q = normalize(query.trim());
  if (!q) return [];
  return SEARCH_INDEX.filter(
    (e) => normalize(e.label).includes(q) || e.synonyms.some((s) => normalize(s).includes(q)),
  ).slice(0, limit);
}
