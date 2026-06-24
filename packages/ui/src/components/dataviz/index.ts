// Librería de dataviz (#189): vocabulario granular de componentes con diseño horneado que el
// agente del dashboard ENSAMBLA (no diseña). Átomos → moléculas → (más adelante) layout/bloques.
// Los estilos viven en '@simpletpv/ui/dataviz.css' (importar una vez en la app).

export {
  ActivityFeed,
  type ActivityFeedProps,
  type ActivityItem,
  type ActivityTone,
} from './ActivityFeed.js';
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
export { BulletMeter, type BulletMeterProps } from './BulletMeter.js';
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
export { DonutStat, type DonutStatItem, type DonutStatProps } from './DonutStat.js';
export { formatDelta, formatValue, type StatFormat } from './format.js';
export { Gauge, type GaugeProps } from './Gauge.js';
export { type HeatCell, HeatLegend, HeatStrip, type HeatStripProps } from './HeatStrip.js';
export { HeroFigure, type HeroFigureChip, type HeroFigureProps } from './HeroFigure.js';
export { InsightCard, type InsightCardProps } from './InsightCard.js';
export { KpiDual, type KpiDualMetric, type KpiDualProps } from './KpiDual.js';
export { type KpiChipTone, KpiStat, type KpiStatProps } from './KpiStat.js';
export { KpiTile, type KpiTileProps } from './KpiTile.js';
export {
  ChartGrid,
  type ChartGridProps,
  HeroSplit,
  type HeroSplitProps,
  KpiGrid,
  type KpiGridProps,
  KpiRow,
  type KpiRowProps,
  PanelShell,
  type PanelShellProps,
} from './layout.js';
export { Leaderboard, type LeaderboardItem, type LeaderboardProps } from './Leaderboard.js';
export { ProgressMeter, type ProgressMeterProps } from './ProgressMeter.js';
export { ProjectionArea, type ProjectionAreaProps } from './ProjectionArea.js';
export { heatColor, rampColor, rampMix, rampPct } from './ramp.js';
export { type RankBarItem, RankBarList, type RankBarListProps } from './RankBarList.js';
export { RibbonStat, type RibbonStatProps } from './RibbonStat.js';
export { SegmentBar, type SegmentBarItem, type SegmentBarProps } from './SegmentBar.js';
export { ShareBar, type ShareBarItem, type ShareBarProps } from './ShareBar.js';
export { SparkArea, type SparkAreaProps, type SparkAreaTone } from './SparkArea.js';
export { SparkBars, type SparkBarsAccent, type SparkBarsProps } from './SparkBars.js';
export { type StockAlertItem, StockAlertList, type StockAlertListProps } from './StockAlertList.js';
export { Treemap, type TreemapItem, type TreemapProps } from './Treemap.js';
