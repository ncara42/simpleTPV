import { WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';
import { rampColor, rampInk, rampPct } from './ramp.js';

// Treemap monocromo (#264): área proporcional a la facturación, rampa azul descendente. Reparte los
// ítems en dos filas balanceadas; dentro de cada fila el ancho ∝ valor. RESPETA el orden de entrada
// (no ordena): el llamador decide el ranking y dónde cae un residual tipo "Otras familias" (último →
// tile más tenue). Alternativa "mapa" al ranking de barras. Presentacional: formatea por construcción.
export interface TreemapItem {
  label: string;
  value: number;
}
export interface TreemapProps {
  items: TreemapItem[];
  format?: StatFormat;
  isLoading?: boolean;
  isError?: boolean;
}

interface Tile extends TreemapItem {
  pctShare: number; // cuota sobre el total (para la nota)
  colorIdx: number; // posición en la rampa (por rango global)
}

export function Treemap({
  items,
  format = 'eur',
  isLoading = false,
  isError = false,
}: TreemapProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  const clean = (items ?? []).filter((d) => Number.isFinite(d.value) && d.value > 0);
  if (clean.length === 0) return <WidgetStates state="empty" />;

  const total = clean.reduce((s, d) => s + d.value, 0);
  const tiles: Tile[] = clean.map((d, i) => ({
    ...d,
    pctShare: (d.value / total) * 100,
    colorIdx: i,
  }));

  // Partición en dos filas: la primera acumula los mayores hasta cruzar ~52% del área; el resto va
  // abajo. Con ≤3 ítems, una sola fila. El flex de cada fila = su cuota → alturas proporcionales.
  let rows: Tile[][];
  if (tiles.length <= 3) {
    rows = [tiles];
  } else {
    let acc = 0;
    let split = 1;
    for (let i = 0; i < tiles.length; i++) {
      acc += tiles[i]!.pctShare;
      if (acc >= 52) {
        split = i + 1;
        break;
      }
    }
    split = Math.max(1, Math.min(split, tiles.length - 1));
    rows = [tiles.slice(0, split), tiles.slice(split)];
  }

  return (
    <div className="dv-treemap" role="img" aria-label="Reparto por área">
      {rows.map((row, r) => {
        const rowShare = row.reduce((s, t) => s + t.pctShare, 0);
        return (
          <div key={r} className="dv-treemap-row" style={{ flexGrow: rowShare }}>
            {row.map((t) => {
              const pct = rampPct(t.colorIdx);
              return (
                <div
                  key={t.label}
                  className="dv-treemap-tile"
                  style={{
                    flexGrow: t.pctShare,
                    background: rampColor(t.colorIdx),
                    color: rampInk(pct),
                  }}
                  title={`${t.label}: ${formatValue(t.value, format)}`}
                >
                  <span className="dv-treemap-name">{t.label}</span>
                  <span className="dv-treemap-note">
                    {formatValue(t.value, format)} · {t.pctShare.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
