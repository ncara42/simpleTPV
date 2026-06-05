import * as React from 'react';

import { cn } from '../lib/cn.js';

export type SparklineTone = 'brand' | 'up' | 'down';

export interface SparklineProps {
  /** Serie de valores en orden cronológico. Con menos de 2 puntos no se dibuja. */
  data: number[];
  /** Tono del trazo y del área (§10.15/§10.16): brand=acento, up=success, down=danger. */
  tone?: SparklineTone;
  /** Alto del SVG en px; el ancho es 100% (full-bleed). Por defecto 44 (§10.15). */
  height?: number;
  /**
   * Etiqueta accesible. Si se aporta, el SVG es `role="img"` con `aria-label`; si se
   * omite, es decorativo (`aria-hidden`) — lo normal cuando el dato ya se muestra al lado.
   */
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

// viewBox fijo (0..100 × 0..32) estirado con preserveAspectRatio="none" a todo el
// ancho/alto reales; el trazo se mantiene fino gracias a vector-effect. Mismo cálculo
// que la sparkline original del dashboard, ahora reutilizable (la consumirán IT-07/IT-08).
const VIEW_W = 100;
const VIEW_H = 32;
const PAD = 3; // margen vertical para que el trazo no toque los bordes

export function Sparkline({
  data,
  tone = 'brand',
  height = 44,
  ariaLabel,
  className,
  'data-testid': testid,
}: SparklineProps): React.ReactElement | null {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * VIEW_W;
    const y = PAD + (1 - (v - min) / span) * (VIEW_H - 2 * PAD);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const [fx, fy] = points[0]!;
  const area = `M ${fx.toFixed(2)},${fy.toFixed(2)} L ${line} L ${VIEW_W},${VIEW_H} L 0,${VIEW_H} Z`;

  const a11y: React.SVGProps<SVGSVGElement> = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true };

  return (
    <svg
      className={cn('ui-spark', `ui-spark-${tone}`, className)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ height }}
      data-testid={testid}
      {...a11y}
    >
      <path className="ui-spark-area" d={area} />
      <polyline className="ui-spark-line" points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
