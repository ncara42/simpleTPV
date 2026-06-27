import type { ReactElement } from 'react';

import type { DashboardPeriod } from '../../lib/dashboard.js';
import { HourHeatmap } from './graficas.js';
import { ClassicKpiCard, ConnectedKpiGrid } from './kpis.js';
import { FamilyShare, FamilyTreemap, ProductRanking } from './listas.js';
import type { PanelProps } from './types.js';

// Registro de RENDER de los widgets del rediseño. Una entrada por widget; se amplía por tandas (cada
// sección del handoff «Fundación Geist»). La fuente de verdad del CATÁLOGO (etiqueta en `registry.ts`,
// tamaño en `dashboard-layout.ts`, categoría/miniatura en `gallery-catalog.tsx`) es independiente; un
// test verifica que cada id con render existe en el catálogo y viceversa.
export const WIDGET_PANELS: Record<string, (props: PanelProps) => ReactElement> = {
  // Sección 01 · KPIs
  'kpi-grid-connected': ConnectedKpiGrid,
  'kpi-classic': ClassicKpiCard,
  // Sección 02 · Gráficas (dash-bars/dash-hour son clásicos, fuera de este registro)
  'graf-heatmap': HourHeatmap,
  // Sección 03 · Listas
  'lista-familia': FamilyShare,
  'lista-rankings': ProductRanking,
  'lista-mix': FamilyTreemap,
};

// Ids de los widgets con render (para el test de paridad con el catálogo).
export const PANEL_RENDER_IDS: readonly string[] = Object.keys(WIDGET_PANELS);

// Render de un widget del rediseño por id. Devuelve null si el id no es de este sistema (el llamador
// encadena con el resto del catálogo: clásicos y genéricos).
export function DashboardPanel({
  id,
  period,
  store,
}: {
  id: string;
  period: DashboardPeriod;
  store?: string | undefined;
}): ReactElement | null {
  const Component = WIDGET_PANELS[id];
  return Component ? <Component period={period} store={store} /> : null;
}
