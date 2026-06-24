import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';
import { rampMix } from './ramp.js';

// Leaderboard de tarjetas (#264): una tarjeta por puesto con chip de ranking, cifra grande, pista y
// barra proporcional. El nº1 lleva chip azul; el resto, chip neutro. Para clasificar tiendas/
// vendedores. Presentacional: ordena por valor desc y formatea por construcción.
export interface LeaderboardItem {
  label: string;
  value: number;
  /** Pista bajo la cifra (p. ej. "137 tickets · 87,19 €"). */
  detail?: string;
}
export interface LeaderboardProps {
  items: LeaderboardItem[];
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

export function Leaderboard({
  items,
  format = 'eur',
  isLoading = false,
  isError = false,
}: LeaderboardProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const clean = (items ?? []).filter((d) => Number.isFinite(d.value));
  if (clean.length === 0) return <WidgetStates state="empty" />;

  const ranked = [...clean].sort((a, b) => b.value - a.value);
  const max = Math.max(...ranked.map((d) => d.value)) || 1;

  return (
    <div className="dv-leaderboard">
      {ranked.map((d, i) => {
        const rank = i + 1;
        const barColor = rank <= 3 ? 'var(--ui-brand)' : rampMix(40);
        return (
          <div key={d.label} className="dv-leaderboard-card">
            <span className={`dv-leaderboard-rank${rank === 1 ? ' is-top' : ''}`}>{rank}</span>
            <div className="dv-leaderboard-name">{d.label}</div>
            <div className="dv-leaderboard-value">{formatValue(d.value, format)}</div>
            {d.detail ? <div className="dv-leaderboard-detail">{d.detail}</div> : null}
            <span className="dv-leaderboard-bar">
              <span
                className="dv-leaderboard-bar-fill"
                style={{ width: `${Math.max((d.value / max) * 100, 3)}%`, background: barColor }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
