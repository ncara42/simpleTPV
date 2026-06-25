// Catálogo de widgets «Geist» (#264): las moléculas dataviz de @simpletpv/ui montadas como widgets
// fijos del dashboard (id `geist-*`), arrastrables desde la paleta igual que los 22 clásicos.
//
// FUENTE ÚNICA de id → etiqueta + tamaño. La consumen:
//   - `lib/dashboard-layout.ts` → mezcla los tamaños en `ITEM_SPECS` (paleta + colocación + reconcile),
//   - `widgets/registry.ts`     → mezcla las etiquetas en `WIDGET_LABELS`,
//   - `widgets/geist/geistWidgets.tsx` → el render de cada uno.
// Mantener los tres en sintonía SIN duplicar: todos parten de aquí (hay un test de paridad).
//
// Es un módulo HOJA (sin imports de la app) para no crear ciclos: dashboard-layout y registry lo
// importan, y geist/meta no importa nada de ellos.

export interface GeistWidgetMeta {
  /** Etiqueta legible (paleta, aria-label, chatbot). */
  label: string;
  /** Tamaño por defecto en unidades de rejilla (12 col), como el resto de `ITEM_SPECS`. */
  size: { w: number; h: number };
}

// 16 widgets, uno por molécula de la galería Geist (lotes 1+2). El orden es el de la paleta.
export const GEIST_WIDGET_META: Record<string, GeistWidgetMeta> = {
  'geist-stat-today': { label: 'Facturación de hoy (stat)', size: { w: 3, h: 2 } },
  'geist-hero-profit': { label: 'Beneficio del mes (héroe)', size: { w: 5, h: 2 } },
  'geist-dual-margin': { label: 'Margen y beneficio', size: { w: 3, h: 2 } },
  'geist-ribbon-kpis': { label: 'Métricas clave (ribbon)', size: { w: 4, h: 2 } },
  'geist-gauge-margin': { label: 'Medidor de margen', size: { w: 3, h: 2 } },
  'geist-bullet-sales': { label: 'Ventas de hoy vs ayer', size: { w: 5, h: 2 } },
  'geist-projection-month': { label: 'Beneficio acumulado del mes', size: { w: 6, h: 3 } },
  'geist-treemap-family': { label: 'Mapa de familias', size: { w: 5, h: 3 } },
  'geist-donut-family': { label: 'Reparto por familia', size: { w: 4, h: 3 } },
  'geist-share-stores': { label: 'Cuota por tienda', size: { w: 5, h: 2 } },
  'geist-leaderboard-sellers': { label: 'Ranking de vendedores', size: { w: 5, h: 3 } },
  'geist-leaderboard-products': { label: 'Top productos por ventas', size: { w: 5, h: 3 } },
  'geist-heat-hours': { label: 'Mapa de calor por hora', size: { w: 7, h: 2 } },
  'geist-spark-ticket': { label: 'Tendencia de ticket medio', size: { w: 3, h: 2 } },
  'geist-bars-profit': { label: 'Beneficio por día (barras)', size: { w: 3, h: 2 } },
  'geist-feed-alerts': { label: 'Avisos de stock recientes', size: { w: 4, h: 3 } },
};

// Ids de los widgets Geist (orden de la paleta).
export const GEIST_WIDGET_IDS: readonly string[] = Object.keys(GEIST_WIDGET_META);

// ¿Es `id` un widget Geist?
export function isGeistWidget(id: string): boolean {
  return id in GEIST_WIDGET_META;
}
