import { type StatFormat, StatLabel, StatValue } from '@simpletpv/ui';
import type { ReactNode } from 'react';

type DeltaTone = 'up' | 'down' | 'flat';

/** Tono de un delta: sube/baja/plano. `invert` para métricas donde bajar es bueno. */
function deltaTone(delta: number | null | undefined, invert: boolean): DeltaTone {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 0.05) return 'flat';
  const positive = delta > 0;
  return (invert ? !positive : positive) ? 'up' : 'down';
}

const ARROW: Record<DeltaTone, string> = { up: '▲', down: '▼', flat: '≈' };

function formatMagnitude(delta: number, unit: string): string {
  const n = Math.abs(delta).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${n} ${unit}`;
}

/**
 * Píldora de variación con flecha y tono cromático, al estilo del informe de
 * referencia («▼ 58 % en bruto», «≈ estable»). `unit` por defecto `%`; el `suffix`
 * matiza la comparación («en bruto», «vs mayo»).
 */
export function DeltaPill({
  delta,
  suffix,
  unit = '%',
  invert = false,
  flatLabel = 'estable',
}: {
  delta: number | null | undefined;
  suffix?: string;
  unit?: string;
  invert?: boolean;
  flatLabel?: string;
}) {
  const tone = deltaTone(delta, invert);
  const body =
    tone === 'flat'
      ? flatLabel
      : `${formatMagnitude(delta as number, unit)}${suffix ? ` ${suffix}` : ''}`;
  return (
    <span className={`mcp-pill mcp-pill--${tone}`}>
      <span className="mcp-pill__arrow">{ARROW[tone]}</span>
      {body}
    </span>
  );
}

/**
 * Tarjeta del informe: etiqueta + cifra grande + subtexto de comparación + píldora.
 * Reusa los átomos del design system (StatLabel/StatValue) sobre una superficie bento.
 */
export function ReportStatCard({
  label,
  value,
  format,
  caption,
  pill,
}: {
  label: string;
  value: number | null | undefined;
  format: StatFormat;
  caption?: string;
  pill?: ReactNode;
}) {
  return (
    <div className="mcp-card mcp-card--stat">
      <StatLabel>{label}</StatLabel>
      <StatValue value={value} format={format} size="lg" />
      {caption ? <span className="mcp-card__sub">{caption}</span> : null}
      {pill ? <div className="mcp-card__pill">{pill}</div> : null}
    </div>
  );
}
