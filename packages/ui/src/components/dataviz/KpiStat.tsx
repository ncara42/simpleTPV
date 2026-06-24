import type { ReactNode } from 'react';

import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';
import { SparkArea, type SparkAreaTone } from './SparkArea.js';
import { SparkBars, type SparkBarsAccent } from './SparkBars.js';

// Celda KPI estilo Vercel Analytics (#264): rótulo arriba, cifra grande, chip de contexto y una
// mini-viz a sangre al pie (área o barras). Pensada para la rejilla conectada por hairline (KpiGrid)
// o como tarjeta suelta. Es una variante de KpiTile con CHIP libre (no solo delta) y viz full-bleed.
//
// El chip admite cualquier texto ("24 / 30 días", "9 roturas", "↑ 0,8 %") con un tono semántico y un
// icono opcional — más expresivo que el DeltaBadge numérico de KpiTile.
export type KpiChipTone = 'neutral' | 'success' | 'danger' | 'warning';

export interface KpiStatProps {
  label: string;
  /** Cifra a formatear. Opcional si se pasa `valueText` ya formateado. */
  value?: number | null;
  format?: StatFormat;
  /** Texto ya formateado; tiene prioridad sobre value/format (para casos como "3,89"). */
  valueText?: string;
  chip?: { text: string; tone?: KpiChipTone; icon?: ReactNode };
  /** Sparkline de área a sangre al pie. */
  spark?: number[];
  sparkTone?: SparkAreaTone;
  /** Mini barras al pie (alternativa a spark, p. ej. "ventas/día"). Tiene prioridad sobre spark. */
  bars?: number[];
  barsAccent?: SparkBarsAccent;
  /** 'grid' (celda de rejilla, 25px) o 'card' (tarjeta suelta con borde, 30px). */
  variant?: 'grid' | 'card';
  /** 'danger' tiñe la tarjeta de alerta (borde + rótulo + cifra en rojo). Solo en variant='card'. */
  tone?: 'default' | 'danger';
  /** Etiqueta de esquina (p. ej. "A · CLÁSICA", "ALERTA"). */
  corner?: string;
  state?: 'loading' | 'error';
}

export function KpiStat({
  label,
  value,
  format = 'eur',
  valueText,
  chip,
  spark,
  sparkTone,
  bars,
  barsAccent,
  variant = 'grid',
  tone = 'default',
  corner,
  state,
}: KpiStatProps) {
  const display = valueText ?? formatValue(value, format);
  const hasViz = (bars && bars.length >= 2) || (spark && spark.length >= 2);
  return (
    <div
      className={`dv-kpistat dv-kpistat--${variant}${tone === 'danger' ? ' dv-kpistat--danger' : ''}${hasViz ? ' dv-kpistat--hasviz' : ''}`}
    >
      {corner ? <span className="dv-kpistat-corner">{corner}</span> : null}
      <span className="dv-stat-label">{label}</span>
      {state ? <WidgetStates state={state} /> : <span className="dv-kpistat-value">{display}</span>}
      {chip ? (
        <span className={`dv-kpistat-chip dv-kpistat-chip--${chip.tone ?? 'neutral'}`}>
          {chip.icon ?? null}
          {chip.text}
        </span>
      ) : null}
      {bars && bars.length >= 2 ? (
        <span className="dv-kpistat-bars">
          <SparkBars data={bars} {...(barsAccent ? { accent: barsAccent } : {})} height={34} />
        </span>
      ) : spark && spark.length >= 2 ? (
        <SparkArea data={spark} tone={sparkTone ?? 'accent'} />
      ) : null}
    </div>
  );
}
