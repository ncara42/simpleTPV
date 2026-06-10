// Helpers de formato puros (testeables con vitest) usados por el dashboard.

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eurCompact = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

// Importe en euros: 1234.5 → "1234,50 €". Tolera null/undefined → "—".
export function fmtEur(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return eur.format(value);
}

// Importe en euros sin céntimos: 1234.5 → "1235 €". Para etiquetas estrechas
// (p.ej. dentro de las barras del dashboard). null/undefined → "—".
export function fmtEurCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return eurCompact.format(value);
}

// Proporción 0–1 → porcentaje "12,3 %". Útil para tasas (descuento, margen…).
export function fmtRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)} %`;
}

// Delta ya en puntos porcentuales (p.ej. 145 = +145%). null → "—". Añade signo.
export function fmtDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} %`;
}

// Color semántico del delta: sube → verde, baja → rojo, igual/null → neutro.
export function deltaTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return 'flat';
  }
  return value > 0 ? 'up' : 'down';
}

// Tendencia de una serie cronológica: compara el último punto con el primero.
// Base de la sparkline para colorear según hacia dónde va el dato.
export function seriesTrend(series: number[] | undefined | null): 'up' | 'down' | 'flat' {
  if (!series || series.length < 2) {
    return 'flat';
  }
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

// Invierte el tono para métricas donde "más es peor" (tasa de descuento o de
// devolución): subir es malo (rojo) y bajar es bueno (verde).
export function invertTone(tone: 'up' | 'down' | 'flat'): 'up' | 'down' | 'flat' {
  return tone === 'up' ? 'down' : tone === 'down' ? 'up' : 'flat';
}

// Número con decimales fijos (UPT, unidades). null → "—".
export function fmtNum(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(decimals);
}

// Horas → texto humano: 1.5 → "1,5 h"; null → "—".
export function fmtHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1).replace('.', ',')} h`;
}

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// Fecha ISO "YYYY-MM-DD" → "4 jun" (día + mes abreviado en castellano). Sin Date para
// evitar desfases de zona horaria. Entrada inválida → "—".
export function fmtDayMonth(date: string | null | undefined): string {
  if (!date) return '—';
  const [, m, d] = date.split('-').map((n) => Number.parseInt(n, 10));
  if (!m || !d || m < 1 || m > 12) return '—';
  return `${d} ${MONTHS_ES[m - 1]}`;
}
