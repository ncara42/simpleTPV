// Librería de dataviz (#189): vocabulario granular de componentes con diseño horneado que el
// agente del dashboard ENSAMBLA (no diseña). Átomos → moléculas → (más adelante) layout/bloques.
// Los estilos viven en '@simpletpv/ui/dataviz.css' (importar una vez en la app).

export {
  ChartLegend,
  type ChartLegendItem,
  DeltaBadge,
  type DeltaBadgeProps,
  MiniSparkline,
  type MiniSparklineProps,
  SectionHeader,
  type SectionHeaderProps,
  StatLabel,
  StatusPill,
  type StatusPillProps,
  StatValue,
  type StatValueProps,
  TrendCaption,
  type TrendCaptionProps,
  WidgetStates,
  type WidgetStatesProps,
} from './atoms.js';
export {
  ComparisonBars,
  type ComparisonBarsProps,
  type SeriesItem,
  ShareDonut,
  type ShareDonutProps,
  TrendArea,
  TrendLine,
} from './charts.js';
export { DataGrid, type DataGridColumn, type DataGridProps } from './DataGrid.js';
export { formatDelta, formatValue, type StatFormat } from './format.js';
export { InsightCard, type InsightCardProps } from './InsightCard.js';
export { KpiTile, type KpiTileProps } from './KpiTile.js';
export {
  ChartGrid,
  type ChartGridProps,
  HeroSplit,
  type HeroSplitProps,
  KpiRow,
  type KpiRowProps,
  PanelShell,
  type PanelShellProps,
} from './layout.js';
export { ProgressMeter, type ProgressMeterProps } from './ProgressMeter.js';
export { type RankBarItem, RankBarList, type RankBarListProps } from './RankBarList.js';
export { SegmentBar, type SegmentBarItem, type SegmentBarProps } from './SegmentBar.js';
export { type StockAlertItem, StockAlertList, type StockAlertListProps } from './StockAlertList.js';
