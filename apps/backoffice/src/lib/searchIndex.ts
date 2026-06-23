// U-06: índice estático de la búsqueda de funciones del header. Cada entrada es
// una FUNCIÓN del backoffice (page o acción concreta con destino) con sinónimos
// del vocabulario del negocio. La búsqueda navega: no busca datos, busca
// funciones. El índice es granular —además de las pages, lista acciones y ajustes
// concretos— para que el palette central devuelva resultados finos.

import type { Tab } from './nav.js';

export interface SearchEntry {
  /** Etiqueta visible en resultados. */
  label: string;
  /** Dónde vive la función. */
  tab: Tab;
  /** Sección que agrupa el resultado en el palette. */
  group: string;
  /** Texto secundario del resultado (aclaración corta). */
  hint?: string;
  /** Sinónimos y términos del negocio que deben encontrarla. */
  synonyms: string[];
}

const SEARCH_INDEX: SearchEntry[] = [
  // ── General ──────────────────────────────────────────────────────────────
  {
    label: 'Dashboard',
    tab: 'dashboard',
    group: 'General',
    hint: 'Vista general',
    synonyms: ['inicio', 'home', 'resumen', 'kpis', 'paneles', 'metricas'],
  },

  // ── Catálogo e inventario ────────────────────────────────────────────────
  {
    label: 'Catálogo',
    tab: 'catalog',
    group: 'Catálogo e inventario',
    hint: 'Productos y precios',
    synonyms: ['productos', 'articulos', 'precios', 'referencias', 'sku'],
  },
  {
    label: 'Nuevo producto',
    tab: 'catalog',
    group: 'Catálogo e inventario',
    hint: 'Acción',
    synonyms: ['alta producto', 'crear producto', 'añadir articulo', 'agregar producto'],
  },
  {
    label: 'Importar productos',
    tab: 'catalog',
    group: 'Catálogo e inventario',
    hint: 'CSV',
    synonyms: ['importar csv', 'carga masiva', 'subir productos', 'importacion'],
  },
  {
    label: 'Familias',
    tab: 'families',
    group: 'Catálogo e inventario',
    hint: 'Categorías',
    synonyms: ['arquetipos', 'subfamilias', 'arbol', 'categorias'],
  },
  {
    // S-12: el término visible es 'Inventario'; 'stock'/'existencias' quedan como
    // sinónimos OCULTOS para que teclearlos siga encontrando la sección (P073).
    label: 'Inventario',
    tab: 'stock',
    group: 'Catálogo e inventario',
    hint: 'Existencias',
    synonyms: ['stock', 'existencias', 'ajuste de stock', 'unidades'],
  },
  {
    label: 'Roturas de stock',
    tab: 'stock',
    group: 'Catálogo e inventario',
    hint: 'Avisos',
    synonyms: ['roturas', 'agotado', 'sin stock', 'bajo minimo', 'alertas', 'avisos'],
  },
  {
    label: 'Traspasos',
    tab: 'transfers',
    group: 'Catálogo e inventario',
    hint: 'Entre tiendas',
    synonyms: ['transferencias', 'mover stock', 'envios entre tiendas'],
  },
  {
    label: 'Nuevo traspaso',
    tab: 'transfers',
    group: 'Catálogo e inventario',
    hint: 'Acción',
    synonyms: ['crear traspaso', 'enviar stock', 'mover existencias'],
  },
  {
    label: 'Proveedores',
    tab: 'suppliers',
    group: 'Catálogo e inventario',
    hint: 'Compras y tarifas',
    synonyms: ['proveedores', 'tarifas', 'compras', 'reponer'],
  },
  // S-25/P157: la "Comparativa de proveedores" se RETIRÓ del buscador a propósito.
  // Pasa a ser un acceso directo (widget del dashboard + deep-link
  // `/suppliers?vista=comparativa`), no una entrada del palette. No volver a añadirla.
  {
    label: 'Pedidos de compra',
    tab: 'suppliers',
    group: 'Catálogo e inventario',
    hint: 'Compras',
    synonyms: ['pedido de compra', 'reposicion', 'comprar', 'reponer'],
  },

  // ── Ventas y clientes ────────────────────────────────────────────────────
  {
    label: 'Ventas',
    tab: 'sales',
    group: 'Ventas y clientes',
    hint: 'Historial',
    synonyms: ['historial', 'tickets', 'facturacion', 'ventas'],
  },
  {
    label: 'Devoluciones',
    tab: 'sales',
    group: 'Ventas y clientes',
    hint: 'Ventas',
    synonyms: ['devoluciones', 'abonos', 'reembolsos'],
  },
  {
    label: 'Exportar ventas',
    tab: 'sales',
    group: 'Ventas y clientes',
    hint: 'Acción',
    synonyms: ['exportar ventas', 'descargar csv', 'informe de ventas'],
  },
  {
    label: 'Clientes B2B',
    tab: 'b2b',
    group: 'Ventas y clientes',
    hint: 'Mayorista',
    synonyms: ['mayorista', 'b2b', 'clientes'],
  },
  {
    label: 'Tarifas B2B',
    tab: 'b2b',
    group: 'Ventas y clientes',
    hint: 'Mayorista',
    synonyms: ['tarifas b2b', 'precios mayorista'],
  },
  {
    label: 'Pedidos B2B',
    tab: 'b2b',
    group: 'Ventas y clientes',
    hint: 'Mayorista',
    synonyms: ['pedidos b2b', 'pedido mayorista'],
  },
  {
    label: 'Promociones',
    tab: 'promotions',
    group: 'Ventas y clientes',
    hint: 'Descuentos',
    synonyms: ['descuentos', 'ofertas', 'campañas'],
  },
  {
    label: 'Nueva promoción',
    tab: 'promotions',
    group: 'Ventas y clientes',
    hint: 'Acción',
    synonyms: ['crear promocion', 'nueva oferta', 'nuevo descuento'],
  },

  // ── Organización ─────────────────────────────────────────────────────────
  {
    label: 'Tiendas',
    tab: 'stores',
    group: 'Organización',
    hint: 'Locales',
    synonyms: ['locales', 'ubicaciones', 'estado operativo'],
  },
  {
    label: 'Dispositivos TPV',
    tab: 'stores',
    group: 'Organización',
    hint: 'Tiendas',
    synonyms: ['dispositivos', 'tpv', 'terminales', 'caja'],
  },
  {
    label: 'Token de fichaje',
    tab: 'stores',
    group: 'Organización',
    hint: 'Tiendas',
    synonyms: ['token de fichaje', 'codigo de fichaje', 'vincular fichaje'],
  },
  {
    label: 'Usuarios',
    tab: 'users',
    group: 'Organización',
    hint: 'Equipo',
    synonyms: ['empleados', 'equipo', 'usuarios'],
  },
  {
    label: 'Roles y permisos',
    tab: 'users',
    group: 'Organización',
    hint: 'Equipo',
    synonyms: ['roles', 'permisos', 'acceso'],
  },
  {
    label: 'PIN de empleado',
    tab: 'users',
    group: 'Organización',
    hint: 'Equipo',
    synonyms: ['pin', 'codigo de empleado', 'clave de empleado'],
  },
  {
    label: 'Control horario',
    tab: 'timeclock',
    group: 'Organización',
    hint: 'Fichajes',
    synonyms: [
      'fichajes',
      'horas',
      'horario',
      'horarios',
      'jornada',
      'jornadas',
      'fichar',
      'turnos',
      'entradas y salidas',
      'control de horario',
    ],
  },
  {
    label: 'Ajustes',
    tab: 'settings',
    group: 'Organización',
    hint: 'Configuración',
    synonyms: ['ajustes', 'configuracion', 'preferencias'],
  },
  {
    label: 'Marca y color',
    tab: 'settings',
    group: 'Organización',
    hint: 'Ajustes',
    synonyms: ['marca', 'color corporativo', 'tema', 'personalizacion'],
  },
  {
    label: 'Logo',
    tab: 'settings',
    group: 'Organización',
    hint: 'Ajustes',
    synonyms: ['logo', 'imagen de marca'],
  },

  // ── Soporte ──────────────────────────────────────────────────────────────
  {
    label: 'Ayuda',
    tab: 'help',
    group: 'Soporte',
    hint: 'FAQ y contacto',
    synonyms: ['soporte', 'faq', 'contacto', 'documentacion'],
  },
  {
    label: 'Integraciones · Claves API',
    tab: 'help',
    group: 'Soporte',
    hint: 'Dentro de Ayuda',
    synonyms: ['api keys', 'claves', 'integracion', 'token api'],
  },
];

const normalize = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Palabras vacías que no aportan a la búsqueda (no deben provocar coincidencias).
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a', 'o', 'u']);

// Parte un texto en palabras normalizadas (sin acentos, minúsculas, ≥2 chars).
function words(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

// Vocabulario único de una entrada: label + grupo + hint + sinónimos, tokenizado.
function entryWords(entry: SearchEntry): string[] {
  const set = new Set<string>();
  for (const field of [entry.label, entry.group, entry.hint ?? '', ...entry.synonyms]) {
    for (const w of words(field)) set.add(w);
  }
  return [...set];
}

// Longitud del prefijo común entre dos cadenas.
function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

// Distancia de edición (Levenshtein) con corte: si supera `max`, devuelve max+1.
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // ninguna ruta puede mejorar
    prev = curr;
  }
  return prev[b.length]!;
}

// Calidad de coincidencia [0..1] de un término contra el vocabulario de la entrada.
// Tolera plurales, conjugaciones (prefijo en ambos sentidos), subcadenas y erratas
// (Levenshtein acotado), para que el usuario encuentre algo sin saber el nombre exacto.
function termQuality(term: string, vocab: string[]): number {
  let best = 0;
  for (const w of vocab) {
    let q = 0;
    if (w === term) q = 1;
    else if (w.startsWith(term) || term.startsWith(w))
      q = 0.9; // catalog/catalogo, control/controlar
    else if (w.includes(term) || term.includes(w))
      q = 0.72; // fichaje/fichajes
    else if (sharedPrefix(term, w) >= 4)
      q = 0.6; // promocion/promociones tras divergir
    else if (term.length >= 4) {
      const max = term.length <= 6 ? 1 : 2; // tolerancia a erratas según longitud
      const d = levenshtein(term, w, max);
      if (d <= max) q = 0.5 - (d - 1) * 0.12;
    }
    if (q > best) best = q;
    if (best === 1) break;
  }
  return best;
}

/**
 * Búsqueda GRANULAR y tolerante. Parte la query en términos y puntúa cada entrada
 * por cómo de bien casan (plurales, conjugaciones, subcadenas y erratas incluidas).
 * Prioriza las entradas que casan TODOS los términos; si ninguna los casa todos,
 * cae a las que casan ALGUNO, para que el usuario siempre vea opciones relevantes.
 */
export function searchFunctions(query: string, limit = 12): SearchEntry[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  const qFull = normalize(query.trim());
  const firstTerm = terms[0]!;

  const scored = SEARCH_INDEX.map((entry) => {
    const vocab = entryWords(entry);
    const label = normalize(entry.label);
    let matched = 0;
    let total = 0;
    for (const term of terms) {
      const q = termQuality(term, vocab);
      if (q > 0) {
        matched++;
        total += q;
      }
    }
    // Empujones de relevancia: el label manda sobre grupo/hint/sinónimo.
    if (label.includes(qFull)) total += 2;
    if (label.startsWith(firstTerm)) total += 1;
    return { entry, matched, total };
  }).filter((s) => s.matched > 0);

  // AND primero (casan todos los términos); si está vacío, OR (casan algunos).
  const allTerms = scored.filter((s) => s.matched === terms.length);
  const pool = allTerms.length > 0 ? allTerms : scored;

  pool.sort(
    (a, b) =>
      b.matched - a.matched || b.total - a.total || a.entry.label.localeCompare(b.entry.label),
  );
  return pool.slice(0, limit).map((s) => s.entry);
}
