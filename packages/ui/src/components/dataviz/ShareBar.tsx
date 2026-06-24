import { WidgetStates } from './atoms.js';
import { rampColor } from './ramp.js';

// Barra de reparto + leyenda en filas (#264): un único riel segmentado en la rampa azul mono y una
// leyenda con punto · etiqueta · cuota. Para métodos de pago, reparto efectivo/tarjeta, etc. Es como
// SegmentBar pero con la leyenda en filas (etiqueta a la izquierda, % a la derecha) en vez de chips.
export interface ShareBarItem {
  label: string;
  value: number;
}
export interface ShareBarProps {
  items: ShareBarItem[];
  /** Alto del riel en px. Por defecto 30 (usa 14 para la variante de bolsillo). */
  barHeight?: number;
  /** 'rows' (filas con % a la derecha) o 'inline' (chips compactos). Por defecto 'rows'. */
  legend?: 'rows' | 'inline';
  isLoading?: boolean;
  isError?: boolean;
}

export function ShareBar({
  items,
  barHeight = 30,
  legend = 'rows',
  isLoading = false,
  isError = false,
}: ShareBarProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const clean = (items ?? []).filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = clean.reduce((s, d) => s + d.value, 0);
  if (clean.length === 0 || total <= 0) return <WidgetStates state="empty" />;

  const segs = clean.map((s, i) => ({ ...s, pct: (s.value / total) * 100, colorIdx: i }));
  const fmtPct = (p: number): string => `${Math.round(p)}%`;

  return (
    <div className={`dv-sharebar dv-sharebar--${legend}`}>
      <div
        className="dv-sharebar-bar"
        style={{ height: barHeight }}
        role="img"
        aria-label="Reparto"
      >
        {segs.map((s) => (
          <span key={s.label} style={{ width: `${s.pct}%`, background: rampColor(s.colorIdx) }} />
        ))}
      </div>
      <ul className="dv-sharebar-legend">
        {segs.map((s) => (
          <li key={s.label} className="dv-sharebar-row">
            <span className="dv-sharebar-dot" style={{ background: rampColor(s.colorIdx) }} />
            <span className="dv-sharebar-label">{s.label}</span>
            <span className="dv-sharebar-pct">{fmtPct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
