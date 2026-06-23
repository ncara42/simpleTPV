import type { Tab } from '../../lib/nav.js';

// Contexto del chatbot por vista del backoffice. El asistente vive en el shell y aparece en
// TODAS las views, pero su saludo, sus sugerencias de arranque y lo que puede hacer cambian
// según dónde esté el usuario:
//   · Dashboard → modo lienzo: compone el tablero (añade/quita widgets, notas, formas).
//   · Resto de views → modo informativo: consulta datos y orienta sobre la pantalla actual,
//     pero NO modifica widgets (el backend le retira las herramientas de lienzo fuera del
//     dashboard; ver crates/http/src/chat.rs).
// El `id` + `label` viajan al backend (StreamChatParams.viewContext) para acotar el system prompt.

export interface ViewContext {
  /** Id de la vista (coincide con `Tab`). Viaja al backend para acotar herramientas. */
  id: Tab;
  /** Etiqueta humana (la misma del sidebar). Viaja al backend para el system prompt. */
  label: string;
  /** Saludo del estado vacío del chat. */
  greeting: string;
  /** Prompts de arranque sugeridos para esta vista. */
  suggestions: string[];
}

type ViewMeta = Omit<ViewContext, 'id'>;

// Saludo + sugerencias por vista. Las sugerencias se alinean con lo que el asistente puede
// responder de verdad (herramientas de datos + descripción de la pantalla), sin prometer
// acciones que solo existen en el Dashboard.
const VIEW_META: Record<Tab, ViewMeta> = {
  dashboard: {
    label: 'Dashboard',
    greeting: '¿En qué te ayudo con el dashboard?',
    suggestions: [
      'Muéstrame los KPIs de hoy',
      'Ventas por hora de hoy',
      'Ventas por familia',
      'Alertas de stock',
      'Top productos más vendidos',
    ],
  },
  sales: {
    label: 'Ventas',
    greeting: '¿En qué te ayudo con las ventas?',
    suggestions: [
      '¿Cuánto he vendido hoy?',
      'Ticket medio de esta semana',
      'Ventas por vendedor',
      'Compara las ventas con ayer',
    ],
  },
  // S-02 fase A: 'inventory' es la Tab activa del shell unificado (Catálogo · Familias ·
  // Existencias). Es la que ve el asistente; catalog/families/stock se conservan como
  // claves válidas del Record (deep-link/redirección) aunque ya no sean la Tab activa.
  inventory: {
    label: 'Inventario',
    greeting: '¿En qué te ayudo con el inventario?',
    suggestions: [
      '¿Cuántos productos activos tengo?',
      'Alertas de stock ahora',
      'Ventas por familia',
      '¿Qué puedo hacer en esta pantalla?',
    ],
  },
  catalog: {
    label: 'Catálogo',
    greeting: '¿En qué te ayudo con el catálogo?',
    suggestions: [
      '¿Cuántos productos activos tengo?',
      'Top productos más vendidos',
      'Ventas por familia',
      '¿Qué puedo hacer en esta pantalla?',
    ],
  },
  families: {
    label: 'Familias',
    greeting: '¿En qué te ayudo con las familias?',
    suggestions: [
      'Ventas por familia',
      '¿Qué familia vende más?',
      '¿Cómo organizo las familias?',
      '¿Para qué sirve esta vista?',
    ],
  },
  stock: {
    label: 'Stock',
    greeting: '¿En qué te ayudo con el stock?',
    suggestions: [
      'Alertas de stock ahora',
      'Productos por debajo del mínimo',
      'Lotes por caducar',
      '¿Qué tienda tiene más roturas?',
    ],
  },
  transfers: {
    label: 'Traspasos',
    greeting: '¿En qué te ayudo con los traspasos?',
    suggestions: [
      '¿Cómo creo un traspaso?',
      'Estados de un traspaso',
      'Traspasos entre tiendas',
      '¿Qué muestra esta vista?',
    ],
  },
  promotions: {
    label: 'Promociones',
    greeting: '¿En qué te ayudo con las promociones?',
    suggestions: [
      '¿Cómo creo una promoción?',
      'Tipos de promoción disponibles',
      'Tasa de descuento actual',
      '¿Qué veo en esta pantalla?',
    ],
  },
  // S-01: 'personal' es la Tab activa del shell unificado (Equipo · Fichajes). Es la
  // que ve el asistente; users/timeclock se conservan como claves válidas del Record
  // (deep-link/redirección) aunque ya no sean la Tab activa.
  personal: {
    label: 'Personal',
    greeting: '¿En qué te ayudo con el personal?',
    suggestions: [
      '¿Cuántos usuarios hay?',
      'Usuarios por rol',
      'Fichajes de hoy',
      '¿Qué puedo hacer en esta pantalla?',
    ],
  },
  users: {
    label: 'Usuarios',
    greeting: '¿En qué te ayudo con los usuarios?',
    suggestions: [
      '¿Cuántos usuarios hay?',
      'Usuarios por rol',
      '¿Cómo añado un usuario?',
      'Roles disponibles',
    ],
  },
  timeclock: {
    label: 'Control horario',
    greeting: '¿En qué te ayudo con el control horario?',
    suggestions: [
      '¿Quién está fichado ahora?',
      'Fichajes de hoy',
      'Horas trabajadas hoy',
      '¿Cómo funciona el control horario?',
    ],
  },
  stores: {
    label: 'Tiendas',
    greeting: '¿En qué te ayudo con las tiendas?',
    suggestions: [
      '¿Cuántas tiendas tengo?',
      'Ventas por tienda hoy',
      'Comparativa entre tiendas',
      '¿Cómo añado una tienda?',
    ],
  },
  suppliers: {
    label: 'Proveedores',
    greeting: '¿En qué te ayudo con los proveedores?',
    suggestions: [
      'Comparativa de precios de proveedores',
      '¿Cuántos proveedores tengo?',
      'Pedidos de compra',
      '¿Qué veo en esta vista?',
    ],
  },
  b2b: {
    label: 'Clientes B2B',
    greeting: '¿En qué te ayudo con los clientes B2B?',
    suggestions: [
      '¿Qué son los clientes B2B?',
      '¿Cómo añado un cliente B2B?',
      'Tarifas B2B',
      '¿Qué veo en esta pantalla?',
    ],
  },
  notifications: {
    label: 'Notificaciones',
    greeting: '¿En qué te ayudo con las notificaciones?',
    suggestions: [
      '¿Qué alertas tengo activas?',
      'Roturas de stock pendientes',
      'Solicitudes de caja sin resolver',
      '¿Qué es más urgente ahora?',
    ],
  },
  verifactu: {
    label: 'VeriFactu',
    greeting: '¿En qué te ayudo con VeriFactu?',
    suggestions: [
      '¿Qué es VeriFactu?',
      '¿Cuándo es obligatorio?',
      'Estado de facturación',
      '¿Para qué sirve esta vista?',
    ],
  },
  settings: {
    label: 'Ajustes',
    greeting: '¿En qué te ayudo con los ajustes?',
    suggestions: [
      '¿Qué puedo configurar aquí?',
      'Personalizar el tema',
      '¿Cómo cambio el logo?',
      'Opciones disponibles',
    ],
  },
  help: {
    label: 'Ayuda',
    greeting: '¿En qué te puedo ayudar?',
    suggestions: [
      '¿Cómo funciona el TPV?',
      '¿Qué puedo hacer en el backoffice?',
      'Guía rápida de ventas',
      '¿Cómo gestiono el stock?',
    ],
  },
};

/** Resuelve el contexto del chatbot para una vista del backoffice. */
export function viewContextFor(tab: Tab): ViewContext {
  return { id: tab, ...VIEW_META[tab] };
}
