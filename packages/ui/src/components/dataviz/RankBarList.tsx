import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Ranking horizontal: cada fila lleva el nombre a la IZQUIERDA, una pista con relleno
// proporcional al valor y el valor a la derecha (look de artefacto). Para top de
// productos/vendedores/familias. Presentacional: ordena, acota filas y formatea por construcción.
export interface RankBarItem {
  label: string;
  value: number;
}
export interface RankBarListProps {
  items: RankBarItem[];
  format?: StatFormat;
  /** Máximo de filas (clamp a 10). El resto se descarta tras ordenar por valor desc. */
  maxRows?: number;
  /** Token de color del relleno de la barra (--ui-*). Relleno SÓLIDO con el acento dataviz por
   * defecto; el nombre va fuera de la barra, así que no necesita tinte legible. */
  colorVar?: string;
  isLoading?: boolean;
  isError?: boolean;
}

const MAX_ROWS = 10;

export function RankBarList({
  items,
  format = 'integer',
  maxRows = MAX_ROWS,
  colorVar = '--ui-chart-accent',
  isLoading = false,
  isError = false,
}: RankBarListProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  if (!items || items.length === 0) return <WidgetStates state="empty" />;

  const rows = [...items]
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.min(Math.max(1, maxRows), MAX_ROWS));
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;

  return (
    <ul className="dv-rank">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="dv-rank-row">
          {/* Nombre a la izquierda + pista con fondo + relleno proporcional + valor a la derecha
              (look de artefacto). La columna de valor (flex:none) queda reservada y el valor nunca
              colisiona con una barra al 100%. */}
          <span className="dv-rank-label">{r.label}</span>
          <div className="dv-rank-track">
            <div
              className="dv-rank-bar"
              style={{
                width: `${Math.max((r.value / max) * 100, 2)}%`,
                backgroundColor: `var(${colorVar})`,
              }}
            />
          </div>
          <span className="dv-rank-value">{formatValue(r.value, format)}</span>
        </li>
      ))}
    </ul>
  );
}
