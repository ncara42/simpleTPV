import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.js';
import { Sparkline } from '../Sparkline.js';
import { formatDelta, formatValue, type StatFormat } from './format.js';

// ── Átomos de dataviz ──────────────────────────────────────────────────────────
// Piezas mínimas con diseño HORNEADO sobre tokens --ui-*: el agente nunca fija tipografía,
// color ni espaciado sueltos; elige variantes (enums). Cada átomo es bonito por construcción.

// Número grande formateado (núcleo de todo KPI). Escala tipográfica por `size`, nunca px sueltos.
export interface StatValueProps {
  value: number | null | undefined;
  format?: StatFormat;
  size?: 'sm' | 'md' | 'lg';
}
export function StatValue({ value, format = 'decimal', size = 'md' }: StatValueProps) {
  return (
    <span className={cn('dv-stat-value', `dv-stat-value--${size}`)}>
      {formatValue(value, format)}
    </span>
  );
}

// Rótulo de métrica en tono atenuado. Tamaño/peso fijos.
export function StatLabel({ children }: { children: ReactNode }) {
  return <span className="dv-stat-label">{children}</span>;
}

// Variación +/- con flecha y color semántico por signo. `invert` para métricas donde bajar es
// bueno (descuento, devolución). Devuelve null si no hay delta.
export interface DeltaBadgeProps {
  delta: number | null | undefined;
  format?: 'percent' | 'eur';
  invert?: boolean;
}
export function DeltaBadge({ delta, format = 'percent', invert = false }: DeltaBadgeProps) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const good = invert ? delta < 0 : delta > 0;
  const bad = invert ? delta > 0 : delta < 0;
  const tone = good ? 'up' : bad ? 'down' : 'flat';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  return (
    <span className={cn('dv-delta', `dv-delta--${tone}`)}>
      <span aria-hidden="true">{arrow}</span> {formatDelta(delta, format)}
    </span>
  );
}

// Texto secundario bajo el valor ('+12% vs ayer'), color por tono.
export interface TrendCaptionProps {
  text: string;
  tone?: 'up' | 'down' | 'neutral';
}
export function TrendCaption({ text, tone = 'neutral' }: TrendCaptionProps) {
  return <span className={cn('dv-trend-caption', `dv-trend-caption--${tone}`)}>{text}</span>;
}

// Sparkline con alto fijo para incrustar en un KpiTile (full-bleed lo aporta el contenedor).
export interface MiniSparklineProps {
  data: number[];
  tone?: 'accent' | 'success' | 'danger';
}
export function MiniSparkline({ data, tone = 'accent' }: MiniSparklineProps) {
  const sparkTone = tone === 'success' ? 'up' : tone === 'danger' ? 'down' : 'brand';
  return (
    <span className="dv-mini-spark">
      <Sparkline data={data} tone={sparkTone} />
    </span>
  );
}

// Leyenda de series: punto del color categórico (token --ui-cat-*) + etiqueta. Compartida.
export interface ChartLegendItem {
  label: string;
  colorVar: string; // p. ej. '--ui-cat-1'
}
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul className="dv-legend">
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="dv-legend-item">
          <span className="dv-legend-dot" style={{ backgroundColor: `var(${it.colorVar})` }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// Título de panel/sección con jerarquía fija. Sustituye los figcaption/títulos sueltos.
export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}
export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <header className="dv-section-header">
      <h3 className="dv-section-title">{title}</h3>
      {subtitle ? <p className="dv-section-sub">{subtitle}</p> : null}
    </header>
  );
}

// Indicador de estado con color semántico (agotado/bajo/ok/caduca).
export interface StatusPillProps {
  label: string;
  tone: 'ok' | 'warn' | 'danger';
}
export function StatusPill({ label, tone }: StatusPillProps) {
  return <span className={cn('dv-status-pill', `dv-status-pill--${tone}`)}>{label}</span>;
}

// Estados loading/error/empty HORNEADOS y compartidos por todas las piezas (antes duplicados
// ad-hoc en cada Generic*: ChartFallback, '—', emptyState). Primera clase.
export interface WidgetStatesProps {
  state: 'loading' | 'error' | 'empty';
  message?: string;
}
export function WidgetStates({ state, message }: WidgetStatesProps) {
  if (state === 'loading') {
    return <div className="dv-state dv-state--loading" role="status" aria-label="Cargando" />;
  }
  const text = message ?? (state === 'error' ? 'No se pudieron cargar los datos.' : 'Sin datos.');
  return (
    <div className={cn('dv-state', `dv-state--${state}`)} role="status">
      {text}
    </div>
  );
}
