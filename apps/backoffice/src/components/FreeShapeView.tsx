import { getStroke } from 'perfect-freehand';

import type { FreeDraw, FreeShape } from '../lib/dashboard-layout.js';

// Convierte el contorno de perfect-freehand en un path SVG suave (cuadráticas).
const avg = (a: number, b: number): number => (a + b) / 2;
function outlineToPath(points: number[][]): string {
  if (points.length === 0) return '';
  if (points.length < 4) {
    const p = points[0]!;
    const x = p[0] ?? 0;
    const y = p[1] ?? 0;
    return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  const a = points[0]!;
  const b = points[1]!;
  const c = points[2]!;
  let d = `M ${a[0]!.toFixed(2)} ${a[1]!.toFixed(2)} Q ${b[0]!.toFixed(2)} ${b[1]!.toFixed(2)} ${avg(b[0]!, c[0]!).toFixed(2)} ${avg(b[1]!, c[1]!).toFixed(2)} T`;
  for (let i = 2; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    d += ` ${avg(p[0]!, q[0]!).toFixed(2)} ${avg(p[1]!, q[1]!).toFixed(2)}`;
  }
  return `${d} Z`;
}

function drawPath(el: FreeDraw): string {
  const outline = getStroke(el.points, {
    size: el.strokeWidth * 2.4,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.5,
  });
  return outlineToPath(outline as number[][]);
}

// Cuerpo visual de una forma vectorial o un trazo a mano alzada. Ocupa la caja (w×h) del
// elemento; el `world` del lienzo lo escala con el zoom. Inerte: el arrastre lo gestiona la
// ElementView que lo envuelve.
export function FreeShapeView({ el }: { el: FreeShape | FreeDraw }) {
  const w = Math.max(1, el.w);
  const h = Math.max(1, el.h);

  if (el.kind === 'draw') {
    return (
      <svg className="dash-free-shape-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path d={drawPath(el)} fill={el.stroke} />
      </svg>
    );
  }

  const sw = el.strokeWidth;
  const inset = sw / 2 + 1;
  const fill = el.fill ?? 'none';

  const svg = (children: React.ReactNode): React.ReactNode => (
    <svg className="dash-free-shape-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {children}
    </svg>
  );

  if (el.shape === 'rect') {
    return svg(
      <rect
        x={inset}
        y={inset}
        width={Math.max(0, w - 2 * inset)}
        height={Math.max(0, h - 2 * inset)}
        rx={4}
        fill={fill}
        stroke={el.stroke}
        strokeWidth={sw}
      />,
    );
  }

  if (el.shape === 'ellipse') {
    return svg(
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={Math.max(0, w / 2 - inset)}
        ry={Math.max(0, h / 2 - inset)}
        fill={fill}
        stroke={el.stroke}
        strokeWidth={sw}
      />,
    );
  }

  // Línea / flecha: une dos esquinas opuestas según la diagonal.
  const main = el.diag !== 'anti';
  const x1 = main ? inset : w - inset;
  const y1 = inset;
  const x2 = main ? w - inset : inset;
  const y2 = h - inset;

  let arrow: React.ReactNode = null;
  if (el.shape === 'arrow') {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = 9 + sw * 2;
    const a1 = ang + Math.PI - 0.42;
    const a2 = ang + Math.PI + 0.42;
    const hx1 = x2 + len * Math.cos(a1);
    const hy1 = y2 + len * Math.sin(a1);
    const hx2 = x2 + len * Math.cos(a2);
    const hy2 = y2 + len * Math.sin(a2);
    arrow = (
      <path
        d={`M ${hx1.toFixed(2)} ${hy1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${hx2.toFixed(2)} ${hy2.toFixed(2)}`}
        fill="none"
        stroke={el.stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  return svg(
    <>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={el.stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {arrow}
    </>,
  );
}
