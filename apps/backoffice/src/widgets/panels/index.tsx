import type { ReactElement } from 'react';

import type { DashboardPeriod } from '../../lib/dashboard.js';
import {
  CompactDonut,
  CompactHero,
  CompactLeaderboard,
  CompactRibbon,
  CompactTreemap,
} from './compactos.js';
import { DiagnosticActivity } from './diagnostico.js';
import { ComplianceChecks, OperationalStatus, StepProgress } from './estado.js';
import { HourArea, HourHeatmap, StoreBars } from './graficas.js';
import { ClassicKpiCard, ConnectedKpiGrid } from './kpis.js';
import { AlertKpi, AreaKpi, DualKpi, SevenDayKpi } from './kpis-formatos.js';
import { FamilyShare, ProductRanking, SalesMix } from './listas.js';
import {
  MiniCumulativeArea,
  MiniFamilyDonut,
  MiniHourColumns,
  MiniHourHeatmap,
  MiniMarginGauge,
  MiniStoreBars,
  MiniTopFamilies,
  MiniTrendLine,
} from './mini.js';
import {
  AvatarList,
  RankingList,
  SimpleList,
  StatusList,
  TaskList,
  VariationList,
} from './tabla.js';
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
  'graf-hour-area': HourArea,
  'graf-store-bars': StoreBars,
  'graf-heatmap': HourHeatmap,
  // Sección 03 · Listas
  'lista-familia': FamilyShare,
  'lista-rankings': ProductRanking,
  'lista-mix': SalesMix,
  // Sección 05 · Compactos
  'cmp-ribbon': CompactRibbon,
  'cmp-donut': CompactDonut,
  'cmp-treemap': CompactTreemap,
  'cmp-leaderboard': CompactLeaderboard,
  'cmp-hero': CompactHero,
  // Sección 06 · Diagnóstico
  'diag-actividad': DiagnosticActivity,
  // Sección 07 · KPIs · más formatos
  'kpi-dual': DualKpi,
  'kpi-area': AreaKpi,
  'kpi-alerta': AlertKpi,
  'kpi-7dias': SevenDayKpi,
  // Sección 08 · Mini gráficas
  'mini-tiendas': MiniStoreBars,
  'mini-tendencia': MiniTrendLine,
  'mini-acumulado': MiniCumulativeArea,
  'mini-donut': MiniFamilyDonut,
  'mini-gauge': MiniMarginGauge,
  'mini-familias': MiniTopFamilies,
  'mini-heatmap': MiniHourHeatmap,
  'mini-columnas': MiniHourColumns,
  // Sección 09 · Listas y tablas
  'tabla-simple': SimpleList,
  'tabla-avatar': AvatarList,
  'tabla-estado': StatusList,
  'tabla-variacion': VariationList,
  'tabla-ranking': RankingList,
  'tabla-tareas': TaskList,
  // Sección 10 · Estado y progreso
  'estado-pasos': StepProgress,
  'estado-operativo': OperationalStatus,
  'estado-cumplimiento': ComplianceChecks,
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
