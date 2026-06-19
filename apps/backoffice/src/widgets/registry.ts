// Catálogo centralizado de widgets del dashboard.
// Las etiquetas legibles se usan en la paleta de adición, los aria-labels y el chatbot.

import { addWidget, type FreeLayout, ITEM_SPECS } from '../lib/dashboard-layout.js';

// Etiquetas legibles de los 22 widgets del catálogo.
export const WIDGET_LABELS: Record<string, string> = {
  // Tarjetas KPI
  'kpi-today': 'Facturación hoy',
  'kpi-avg-ticket': 'Ticket medio',
  'kpi-upt': 'UPT',
  'kpi-margin': '% Margen',
  'kpi-profit': 'Beneficio',
  'kpi-discount': 'Tasa descuento',
  'kpi-return': 'Tasa devolución',
  'kpi-lost-sales': 'Venta perdida est.',
  // Paneles
  'dash-bars': 'Ventas',
  'dash-hour': 'Ventas por hora',
  'dash-family': 'Ventas por familia',
  'rank-sales': 'Rankings de producto',
  'rank-margin': 'Rankings de producto',
  'rank-rotation': 'Rankings de producto',
  'dash-stockout': 'Roturas de stock',
  'dash-expiring': 'Lotes por caducar',
  'dash-purchase-orders': 'Pedidos de compra',
  'dash-sales-emp': 'Ventas por vendedor',
  'dash-discount-emp': 'Descuento por empleado',
  'dash-suppliers': 'Comparativa de proveedores',
  'dash-rotation': 'Rotación',
  'dash-timeclock': 'Fichajes de hoy',
};

// Todos los ids de widget disponibles en el catálogo (22).
export const ALL_WIDGET_IDS: readonly string[] = Object.keys(ITEM_SPECS);

// Devuelve la etiqueta legible de un widget, o su id si no está registrado.
export function getWidgetLabel(id: string): string {
  return WIDGET_LABELS[id] ?? id;
}

// Añade un widget al lienzo libre centrado en `at`.
// Si `at` se omite, se coloca en el origen; el llamador debe pasar el centro del viewport.
// No-op si el widget ya está presente o no existe en el catálogo.
export function addWidgetToCanvas(
  layout: FreeLayout,
  widgetId: string,
  at: { x: number; y: number } = { x: 0, y: 0 },
): FreeLayout {
  return addWidget(layout, widgetId, at);
}
