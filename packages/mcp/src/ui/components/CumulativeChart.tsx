// Acumulado de facturación día a día: mes en curso (área + línea, se corta hoy) vs
// mes anterior completo (línea punteada). El design system no tiene un gráfico de dos
// series de longitudes distintas, así que se dibuja aquí con SVG, pero TODO el color
// sale de los tokens (--ui-success / --ui-chart-accent / --ui-border…), de modo que
// se adapta al tema claro/oscuro del host como el resto del panel.

const VB_W = 1000;
const VB_H = 300;
const PAD = { top: 14, right: 18, bottom: 30, left: 64 } as const;
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const Y_TICKS = 4;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(value));
  const norm = value / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function kEur(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k€`;
  return `${Math.round(value)}€`;
}

/** Construye el atributo `d` de una polilínea sobre los índices de la serie. */
function linePath(series: number[], x: (i: number) => number, y: (v: number) => number): string {
  if (series.length === 0) return '';
  return series
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ');
}

export function CumulativeChart({ current, previous }: { current: number[]; previous: number[] }) {
  const totalDays = Math.max(current.length, previous.length, 2);
  const maxVal = niceMax(Math.max(1, ...current, ...previous));

  const x = (i: number) => PAD.left + (i / (totalDays - 1)) * PLOT_W;
  const y = (v: number) => PAD.top + PLOT_H - (v / maxVal) * PLOT_H;

  const prevPath = linePath(previous, x, y);
  const curPath = linePath(current, x, y);
  const areaPath =
    current.length > 0
      ? `${curPath} L ${x(current.length - 1).toFixed(2)},${(PAD.top + PLOT_H).toFixed(2)} ` +
        `L ${x(0).toFixed(2)},${(PAD.top + PLOT_H).toFixed(2)} Z`
      : '';

  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, t) => (maxVal * t) / Y_TICKS);
  const xStep = totalDays <= 12 ? 2 : 5;
  const xTicks: number[] = [];
  for (let i = 0; i < totalDays; i += xStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== totalDays - 1) xTicks.push(totalDays - 1);

  return (
    <svg
      className="mcp-cum"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Facturación diaria acumulada: mes en curso frente al mes anterior"
    >
      <defs>
        <linearGradient id="mcpCumFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ui-success)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--ui-success)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rejilla + eje Y */}
      {yTicks.map((v) => (
        <g key={v}>
          <line className="mcp-cum__grid" x1={PAD.left} x2={VB_W - PAD.right} y1={y(v)} y2={y(v)} />
          <text className="mcp-cum__ylabel" x={PAD.left - 10} y={y(v)} dy="0.32em">
            {kEur(v)}
          </text>
        </g>
      ))}

      {/* Mes anterior: línea punteada (azul de acento) */}
      {prevPath ? <path className="mcp-cum__prev" d={prevPath} /> : null}

      {/* Mes en curso: área + línea (verde) */}
      {areaPath ? <path className="mcp-cum__area" d={areaPath} /> : null}
      {curPath ? <path className="mcp-cum__cur" d={curPath} /> : null}

      {/* Eje X (días) */}
      {xTicks.map((i) => (
        <text key={i} className="mcp-cum__xlabel" x={x(i)} y={VB_H - 8} textAnchor="middle">
          {`D${i + 1}`}
        </text>
      ))}
    </svg>
  );
}
