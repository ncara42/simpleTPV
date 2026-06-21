// Formateo de cifras es-ES para la librería de dataviz. Centraliza Intl para que TODA pieza
// muestre números con el mismo formato (separador de miles ., decimal ,) y el agente solo
// elija un `format` (enum), nunca toque el formateo. #189 (librería de componentes).

export type StatFormat = 'eur' | 'percent' | 'decimal' | 'units' | 'integer';

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

// Formatea un valor numérico según el `format`. Devuelve '—' para valores nulos/no finitos
// (estado vacío uniforme en todas las piezas).
export function formatValue(value: number | null | undefined, format: StatFormat): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'eur':
      return EUR.format(value);
    case 'percent':
      return `${DECIMAL.format(value)} %`;
    case 'units':
      return `${INTEGER.format(value)} uds.`;
    case 'integer':
      return INTEGER.format(value);
    case 'decimal':
    default:
      return DECIMAL.format(value);
  }
}

// Formatea una variación (delta) con signo explícito. Para DeltaBadge/TrendCaption.
export function formatDelta(delta: number, format: 'percent' | 'eur'): string {
  const abs = Math.abs(delta);
  const body = format === 'eur' ? EUR.format(abs) : `${DECIMAL.format(abs)} %`;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${body}`;
}
