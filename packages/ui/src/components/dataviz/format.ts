// Formateo de cifras es-ES para la librería de dataviz. Centraliza Intl para que TODA pieza
// muestre números con el mismo formato (separador de miles ., decimal ,) y el agente solo
// elija un `format` (enum), nunca toque el formateo. #189 (librería de componentes).

// `percent` espera el valor YA en escala 0..100 (un 15% es 15). `percentRatio` espera una fracción
// 0..1 (un 15% es 0,15) y la multiplica ×100 antes de formatear — los endpoints del dashboard
// (discountRate, returnRate, avgDiscountPct, marginPct, stockout rate) devuelven fracciones (#208).
export type StatFormat =
  | 'eur'
  | 'eur0'
  | 'percent'
  | 'percentRatio'
  | 'decimal'
  | 'units'
  | 'integer';

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
// Euro sin decimales: para cifras redondeadas a miles (treemap, donut, leaderboard, objetivo) donde
// los céntimos sobran. Las cifras KPI precisas (facturación, ticket medio) siguen usando 'eur'.
const EUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const ONE_DEC = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

// Magnitud compacta (10k, 1,2M) para etiquetas de eje: caben en el gutter estrecho del chart, a
// diferencia del eur completo ("10.000,00 €") que se desbordaba y se recortaba por la izquierda.
function compactMagnitude(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${ONE_DEC.format(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${ONE_DEC.format(value / 1_000)}k`;
  return INTEGER.format(value);
}

// Formatea un valor numérico según el `format`. Devuelve '—' para valores nulos/no finitos
// (estado vacío uniforme en todas las piezas).
export function formatValue(value: number | null | undefined, format: StatFormat): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'eur':
      return EUR.format(value);
    case 'eur0':
      return EUR0.format(value);
    case 'percent':
      return `${DECIMAL.format(value)} %`;
    case 'percentRatio':
      return `${DECIMAL.format(value * 100)} %`;
    case 'units':
      return `${INTEGER.format(value)} uds.`;
    case 'integer':
      return INTEGER.format(value);
    case 'decimal':
    default:
      return DECIMAL.format(value);
  }
}

// Etiqueta de EJE (compacta) según el formato. Mantiene el "%" en tasas (si no, "60" confunde) y
// abrevia las magnitudes (eur/units/decimal/integer) para que quepan en el gutter del chart sin
// recortarse. El valor exacto (eur con céntimos, etc.) sigue en los tags/tooltips vía formatValue.
export function formatAxisValue(value: number | null | undefined, format: StatFormat): string {
  if (value == null || !Number.isFinite(value)) return '';
  switch (format) {
    case 'percent':
      return `${INTEGER.format(value)} %`;
    case 'percentRatio':
      return `${INTEGER.format(value * 100)} %`;
    default:
      return compactMagnitude(value);
  }
}

// Formatea una variación (delta) con signo explícito. Para DeltaBadge/TrendCaption.
export function formatDelta(delta: number, format: 'percent' | 'eur'): string {
  const abs = Math.abs(delta);
  const body = format === 'eur' ? EUR.format(abs) : `${DECIMAL.format(abs)} %`;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${body}`;
}
