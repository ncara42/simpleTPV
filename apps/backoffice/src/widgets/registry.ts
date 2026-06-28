// Catálogo centralizado de widgets del dashboard.
// Las etiquetas legibles se usan en la paleta de adición, los aria-labels y el chatbot.
// El registry mantiene los metadatos (etiqueta, tipo, tamaño) de los widgets fijos del catálogo
// (Ventas + Ventas por hora + los Geist #264) y permite registrar widgets genéricos (gen:<uuid>)
// creados por el agente (#188).

import { createElement, type ReactElement } from 'react';

import { BLOCK_CATALOG } from '../lib/dashboard-blocks.js';
import {
  addWidget,
  type FreeLayout,
  type GenericSpec,
  ITEM_SPECS,
} from '../lib/dashboard-layout.js';
import { GenericWidget } from './generic/GenericWidget.js';

// Etiquetas legibles del catálogo. Solo conservamos «Ventas» y «Ventas por hora».
export const WIDGET_LABELS: Record<string, string> = {
  'dash-bars': 'Ventas',
  'dash-hour': 'Ventas por hora',
  // Sección 01 · KPIs (rediseño)
  'kpi-grid-connected': 'KPIs (rejilla conectada)',
  'kpi-classic': 'KPI (tarjeta clásica)',
  // Sección 02 · Gráficas (rediseño)
  'graf-heatmap': 'Mapa de calor horario',
  // Sección 03 · Listas (rediseño)
  'lista-familia': 'Reparto por familia',
  'lista-rankings': 'Ranking de productos',
  'lista-mix': 'Mix por familia (treemap)',
  // Sección 05 · Compactos (rediseño)
  'cmp-ribbon': 'Banda compacta de métricas',
  'cmp-donut': 'Donut por familia',
  'cmp-treemap': 'Treemap compacto',
  'cmp-leaderboard': 'Top vendedores',
  'cmp-hero': 'Cifra-héroe',
  // Sección 06 · Diagnóstico (rediseño)
  'diag-actividad': 'Actividad (alertas)',
  // Sección 07 · KPIs · más formatos (rediseño)
  'kpi-dual': 'KPI dual',
  'kpi-area': 'KPI con área',
  'kpi-alerta': 'KPI de alerta',
  'kpi-7dias': 'KPI 7 días',
};

// Tipo de widget en el registry. Los del catálogo son 'kpi' o 'panel' (su render lo posee
// DashboardPage durante la transición); los 'generic' se renderizan vía GenericWidget.
export type WidgetKind = 'kpi' | 'panel' | 'generic';

export interface WidgetSpec {
  id: string;
  label: string;
  kind: WidgetKind;
  /** Tamaño por defecto en unidades de rejilla (de ITEM_SPECS o GenericSpec.defaultSize). */
  defaultSize: { w: number; h: number };
  /** Render del widget. Opcional para los del catálogo (los pinta DashboardPage por ahora). */
  render?: () => ReactElement;
  /** Solo 'generic': configuración con la que el agente parametrizó el widget. */
  genericSpec?: GenericSpec;
}

// Todos los ids de widget del catálogo fijo (Ventas + Ventas por hora + los Geist #264).
export const ALL_WIDGET_IDS: readonly string[] = Object.keys(ITEM_SPECS);

// Registro vivo. Se siembra con los widgets del catálogo (metadatos); los genéricos se
// añaden en runtime con `registerGenericWidget`.
export const WIDGET_REGISTRY = new Map<string, WidgetSpec>(
  ALL_WIDGET_IDS.map((id) => [
    id,
    {
      id,
      label: WIDGET_LABELS[id] ?? id,
      kind: id.startsWith('kpi-') ? 'kpi' : 'panel',
      defaultSize: ITEM_SPECS[id] ?? { w: 4, h: 2 },
    } satisfies WidgetSpec,
  ]),
);

// Siembra los BLOQUES pre-cableados (#205) como metadatos de catálogo (`block:<id>` → label +
// tamaño). El agente los coloca con `add_widget widget_id='block:<id>'`; la colocación produce un
// panel v2 bajo un id `gen:` (ver applyCanvasOp), así que aquí solo viven los metadatos.
for (const [id, meta] of Object.entries(BLOCK_CATALOG)) {
  WIDGET_REGISTRY.set(id, {
    id,
    label: meta.label,
    kind: 'panel',
    defaultSize: meta.defaultSize,
  });
}

// Devuelve la etiqueta legible de un widget (catálogo, genérico registrado, o el id).
export function getWidgetLabel(id: string): string {
  return WIDGET_REGISTRY.get(id)?.label ?? WIDGET_LABELS[id] ?? id;
}

// Devuelve la WidgetSpec registrada (catálogo o genérico), si existe.
export function getWidgetSpec(id: string): WidgetSpec | undefined {
  return WIDGET_REGISTRY.get(id);
}

// Construye la WidgetSpec de un widget genérico a partir de su GenericSpec.
export function buildGenericWidgetSpec(id: string, spec: GenericSpec): WidgetSpec {
  return {
    id,
    label: spec.title,
    kind: 'generic',
    defaultSize: spec.defaultSize,
    genericSpec: spec,
    render: () => createElement(GenericWidget, { spec }),
  };
}

// Registra (o reemplaza) un widget genérico `gen:<uuid>` en el registry y lo devuelve.
export function registerGenericWidget(id: string, spec: GenericSpec): WidgetSpec {
  const widget = buildGenericWidgetSpec(id, spec);
  WIDGET_REGISTRY.set(id, widget);
  return widget;
}

// Elimina un widget genérico del registry (al quitarlo del lienzo o limpiar huérfanos).
export function unregisterGenericWidget(id: string): void {
  WIDGET_REGISTRY.delete(id);
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
