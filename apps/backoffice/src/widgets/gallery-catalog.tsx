// Catálogo GRÁFICO de widgets para el selector «Añadir widget» (modal galería, #rediseño).
// A diferencia de `registry.ts` (metadatos: etiqueta/tamaño para el lienzo), aquí vive la
// presentación de la GALERÍA: la categoría a la que pertenece cada widget y su MINIATURA visual.
//
// Las 11 categorías = las 11 secciones del handoff «Fundación Geist». Se van rellenando por TANDAS;
// hoy solo están los dos clásicos conservados (Ventas, Ventas por hora) en «Gráficas». Cada `id`
// DEBE existir en `ITEM_SPECS` (hay un test de paridad en WidgetGalleryModal.test.tsx).

import type { ReactNode } from 'react';

export interface GalleryCategory {
  /** Clave estable (no se traduce). */
  id: string;
  /** Numeral de sección del handoff (01–11), monoespaciado en el carril. */
  num: string;
  label: string;
}

// Orden = orden del handoff. Las categorías sin widgets aún se muestran (roadmap) pero vacías.
export const GALLERY_CATEGORIES: readonly GalleryCategory[] = [
  { id: 'kpis', num: '01', label: 'KPIs' },
  { id: 'graficas', num: '02', label: 'Gráficas' },
  { id: 'listas', num: '03', label: 'Listas' },
  { id: 'exploraciones', num: '04', label: 'Más exploraciones' },
  { id: 'compactos', num: '05', label: 'Compactos' },
  { id: 'diagnostico', num: '06', label: 'Diagnóstico' },
  { id: 'kpis-formatos', num: '07', label: 'KPIs · más formatos' },
  { id: 'mini', num: '08', label: 'Mini gráficas' },
  { id: 'listas-tablas', num: '09', label: 'Listas y tablas' },
  { id: 'estado', num: '10', label: 'Estado y progreso' },
  { id: 'especializados', num: '11', label: 'Especializados' },
];

export interface GalleryEntry {
  /** Id del widget en el catálogo (= clave de `ITEM_SPECS` / `WIDGET_REGISTRY`). */
  id: string;
  label: string;
  /** `GalleryCategory.id` al que pertenece. */
  category: string;
  description: string;
  /** Miniatura gráfica (SVG inline, escala al hueco de la tarjeta). */
  thumbnail: ReactNode;
}

// ── Miniaturas (Fundación Geist: monocromía azul+gris, planas, tabular) ──
// Azul de la serie principal = var(--ui-brand); el tono claro se deriva por color-mix del propio
// acento (mismo recurso que la rampa de la galería), así sigue el tema claro/oscuro sin hardcodear.
const SOFT_BLUE = 'color-mix(in oklab, var(--ui-brand) 32%, var(--ui-surface))';

// «Ventas» (dash-bars): barras de facturación por tienda; las 3 primeras en acento, el resto suaves.
function ThumbBars(): ReactNode {
  const bars = [100, 90, 82, 66, 60];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={6 + i * 25}
          y={64 - (h / 100) * 58}
          width="17"
          height={(h / 100) * 58}
          rx="2.5"
          fill={i < 3 ? 'var(--ui-brand)' : SOFT_BLUE}
        />
      ))}
    </svg>
  );
}

// «Ventas por hora» (dash-hour): área de distribución horaria con relleno suave y trazo de acento.
function ThumbHours(): ReactNode {
  const line = 'M0,46 L22,30 L44,33 L66,15 L88,34 L110,23 L132,28';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${line} L132,64 L0,64 Z`} fill="var(--ui-brand-soft)" />
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// «KPIs · rejilla conectada»: tres celdas unidas por hairline, cada una con cifra y mini-tendencia.
function ThumbKpiGrid(): ReactNode {
  const cols = [0, 44, 88];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {cols.map((x, i) => (
        <g key={i}>
          <rect x={x + 9} y={11} width={15} height={3} rx={1.5} fill={SOFT_BLUE} />
          <rect x={x + 9} y={20} width={26} height={7} rx={2} fill="var(--ui-brand)" />
          <path
            d={`M${x + 9},48 L${x + 17},42 L${x + 25},45 L${x + 36},38`}
            fill="none"
            stroke={SOFT_BLUE}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      <line x1="44" y1="4" x2="44" y2="60" stroke="var(--ui-border)" strokeWidth="1" />
      <line x1="88" y1="4" x2="88" y2="60" stroke="var(--ui-border)" strokeWidth="1" />
    </svg>
  );
}

// «KPI · tarjeta clásica»: una sola cifra grande en tarjeta con sparkline a sangre.
function ThumbKpiCard(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x="6"
        y="6"
        width="120"
        height="52"
        rx="6"
        fill="none"
        stroke="var(--ui-border)"
        strokeWidth="1"
      />
      <rect x="16" y="14" width="30" height="4" rx="2" fill={SOFT_BLUE} />
      <rect x="16" y="24" width="58" height="10" rx="2" fill="var(--ui-brand)" />
      <path
        d="M16,50 L34,42 L52,46 L74,36 L96,44 L116,34"
        fill="none"
        stroke={SOFT_BLUE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// «Mapa de calor horario» (graf-heatmap): tira de celdas, intensidad por facturación; el pico saturado.
function ThumbHeatmap(): ReactNode {
  const heat = [0.16, 0.34, 0.58, 1, 0.82, 0.46, 0.24]; // intensidades [0,1]; la de valor 1 = hora punta.
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {heat.map((t, i) => (
        <rect
          key={i}
          x={6 + i * 18}
          y={20}
          width={15}
          height={24}
          rx={2.5}
          fill={`color-mix(in oklab, var(--ui-brand) ${Math.round(8 + t * 92)}%, var(--ui-surface))`}
        />
      ))}
    </svg>
  );
}

// «Distribución horaria» (graf-hour-area): mini área con su punto de pico relleno.
function ThumbHourArea(): ReactNode {
  const pts: ReadonlyArray<readonly [number, number]> = [
    [10, 40],
    [32, 24],
    [54, 26],
    [76, 16],
    [98, 34],
    [122, 28],
  ];
  const line = 'M' + pts.map(([x, y]) => `${x},${y}`).join(' L');
  const area = `${line} L122,58 L10,58 Z`;
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} fill={SOFT_BLUE} opacity="0.4" />
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx="76"
        cy="16"
        r="3.5"
        fill="var(--ui-brand)"
        stroke="var(--ui-surface)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// «Reparto por familia» (lista-familia): riel segmentado en la rampa azul + dos filas de leyenda.
function ThumbShareBar(): ReactNode {
  const segs = [50, 34, 24, 16]; // anchos en px (suman ~124); intensidad descendente.
  let x = 6;
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {segs.map((w, i) => {
        const rx = x;
        x += w;
        return (
          <rect
            key={i}
            x={rx}
            y={12}
            width={w - 2}
            height={12}
            rx={2}
            fill={`color-mix(in oklab, var(--ui-brand) ${100 - i * 22}%, var(--ui-surface))`}
          />
        );
      })}
      <rect x={6} y={34} width={6} height={6} rx={2} fill="var(--ui-brand)" />
      <rect x={18} y={36} width={48} height={3} rx={1.5} fill={SOFT_BLUE} />
      <rect x={6} y={48} width={6} height={6} rx={2} fill={SOFT_BLUE} />
      <rect x={18} y={50} width={36} height={3} rx={1.5} fill={SOFT_BLUE} />
    </svg>
  );
}

// «Ranking de productos» (lista-rankings): tres filas con chip de puesto y barra proporcional.
function ThumbLeaderboard(): ReactNode {
  const rows = [
    { w: 96, top: true },
    { w: 70, top: false },
    { w: 50, top: false },
  ];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {rows.map((r, i) => {
        const y = 8 + i * 18;
        return (
          <g key={i}>
            <rect
              x={6}
              y={y}
              width={11}
              height={11}
              rx={2.5}
              fill={r.top ? 'var(--ui-brand)' : SOFT_BLUE}
            />
            <rect
              x={22}
              y={y + 2}
              width={r.w}
              height={7}
              rx={2}
              fill={r.top ? 'var(--ui-brand)' : SOFT_BLUE}
            />
          </g>
        );
      })}
    </svg>
  );
}

// «Rankings» (lista-rankings): pestaña activa arriba + filas con puesto y barra fina proporcional.
function ThumbRankTabs(): ReactNode {
  const widths = [98, 72, 52];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={6} y={6} width={70} height={11} rx={4} fill="var(--ui-surface-subtle)" />
      <rect x={8} y={8} width={30} height={7} rx={3} fill="var(--ui-brand)" />
      {widths.map((w, i) => {
        const y = 28 + i * 12;
        return (
          <g key={i}>
            <rect
              x={6}
              y={y}
              width={6}
              height={6}
              rx={1.5}
              fill={i === 0 ? 'var(--ui-brand)' : SOFT_BLUE}
            />
            <rect x={16} y={y + 4} width={w} height={2.5} rx={1.25} fill="var(--ui-brand)" />
          </g>
        );
      })}
    </svg>
  );
}

// «Mix por familia» (lista-mix): mapa de área (treemap) con un tile grande y tres menores.
function ThumbTreemap(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={6} y={8} width={66} height={48} rx={3} fill="var(--ui-brand)" />
      <rect
        x={76}
        y={8}
        width={50}
        height={23}
        rx={3}
        fill={`color-mix(in oklab, var(--ui-brand) 64%, var(--ui-surface))`}
      />
      <rect
        x={76}
        y={35}
        width={30}
        height={21}
        rx={3}
        fill={`color-mix(in oklab, var(--ui-brand) 42%, var(--ui-surface))`}
      />
      <rect x={110} y={35} width={16} height={21} rx={3} fill={SOFT_BLUE} />
    </svg>
  );
}

// «Banda compacta» (cmp-ribbon): tres filas de métrica (rótulo + cifra) con mini-tendencia a la dcha.
function ThumbRibbon(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[0, 20, 40].map((dy, i) => (
        <g key={i}>
          <rect x={6} y={9 + dy} width={28} height={4} rx={2} fill={SOFT_BLUE} />
          <rect x={6} y={16 + dy} width={22} height={6} rx={2} fill="var(--ui-brand)" />
          <path
            d={`M86,${17 + dy} L98,${12 + dy} L110,${15 + dy} L124,${10 + dy}`}
            fill="none"
            stroke={SOFT_BLUE}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}

// «Donut por familia» (cmp-donut): anillo segmentado en la rampa azul con hueco central.
function ThumbDonut(): ReactNode {
  const R = 20;
  const C = 2 * Math.PI * R;
  const segs = [0.5, 0.3, 0.2];
  let acc = 0;
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g transform="translate(66,32) rotate(-90)">
        {segs.map((f, i) => {
          const len = f * C;
          const node = (
            <circle
              key={i}
              r={R}
              fill="none"
              strokeWidth={11}
              stroke={`color-mix(in oklab, var(--ui-brand) ${100 - i * 30}%, var(--ui-surface))`}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return node;
        })}
      </g>
    </svg>
  );
}

// «Cifra-héroe» (cmp-hero): número gigante + chip a la izquierda y área de tendencia a la derecha.
function ThumbHero(): ReactNode {
  const line = 'M74,50 L88,40 L100,44 L112,32 L126,36';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={8} y={12} width={24} height={4} rx={2} fill={SOFT_BLUE} />
      <rect x={8} y={22} width={52} height={15} rx={3} fill="var(--ui-brand)" />
      <rect x={8} y={44} width={30} height={6} rx={3} fill={SOFT_BLUE} />
      <path d={`${line} L126,58 L74,58 Z`} fill="var(--ui-brand-soft)" />
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// «Actividad» (diag-actividad): línea de tiempo con punto por hito y dos líneas de texto por fila.
function ThumbActivity(): ReactNode {
  const rows = [12, 32, 52];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1={13} y1={8} x2={13} y2={56} stroke="var(--ui-border)" strokeWidth={1.5} />
      {rows.map((y, i) => (
        <g key={i}>
          <circle
            cx={13}
            cy={y}
            r={4}
            fill={`color-mix(in oklab, var(--ui-brand) ${100 - i * 30}%, var(--ui-surface))`}
          />
          <rect x={26} y={y - 5} width={74} height={4} rx={2} fill="var(--ui-brand)" />
          <rect x={26} y={y + 2} width={48} height={3} rx={1.5} fill={SOFT_BLUE} />
        </g>
      ))}
    </svg>
  );
}

// «KPI dual» (kpi-dual): tarjeta con dos métricas apiladas separadas por hairline.
function ThumbKpiDual(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x={6}
        y={6}
        width={120}
        height={52}
        rx={6}
        fill="none"
        stroke="var(--ui-border)"
        strokeWidth={1}
      />
      <rect x={16} y={12} width={26} height={3} rx={1.5} fill={SOFT_BLUE} />
      <rect x={16} y={18} width={44} height={8} rx={2} fill="var(--ui-brand)" />
      <line x1={16} y1={32} x2={116} y2={32} stroke="var(--ui-border)" strokeWidth={1} />
      <rect x={16} y={38} width={26} height={3} rx={1.5} fill={SOFT_BLUE} />
      <rect x={16} y={44} width={44} height={8} rx={2} fill="var(--ui-brand)" />
    </svg>
  );
}

// «KPI con área» (kpi-area): tarjeta con cifra y área de tendencia a sangre al pie.
function ThumbKpiArea(): ReactNode {
  const line = 'M10,46 L34,40 L58,43 L86,34 L110,40 L122,35';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x={6}
        y={6}
        width={120}
        height={52}
        rx={6}
        fill="none"
        stroke="var(--ui-border)"
        strokeWidth={1}
      />
      <rect x={16} y={13} width={28} height={4} rx={2} fill={SOFT_BLUE} />
      <rect x={16} y={22} width={52} height={10} rx={2} fill="var(--ui-brand)" />
      <path d={`${line} L122,52 L10,52 Z`} fill="var(--ui-brand-soft)" />
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// «KPI de alerta» (kpi-alerta): tarjeta teñida de rojo con cifra y chip de roturas.
function ThumbKpiAlert(): ReactNode {
  const danger = 'var(--ui-danger, #d6201f)';
  const dangerSoft = 'color-mix(in oklab, var(--ui-danger, #d6201f) 24%, var(--ui-surface))';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x={6}
        y={6}
        width={120}
        height={52}
        rx={6}
        fill="none"
        stroke={danger}
        strokeWidth={1.5}
      />
      <rect x={16} y={14} width={34} height={4} rx={2} fill={dangerSoft} />
      <rect x={16} y={24} width={50} height={11} rx={2} fill={danger} />
      <rect x={16} y={44} width={40} height={8} rx={4} fill={dangerSoft} />
    </svg>
  );
}

// «KPI 7 días» (kpi-7dias): tarjeta con cifra y mini-barras de la serie reciente (última resaltada).
function ThumbKpi7d(): ReactNode {
  const heights = [10, 16, 12, 20, 14, 22, 26];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x={6}
        y={6}
        width={120}
        height={52}
        rx={6}
        fill="none"
        stroke="var(--ui-border)"
        strokeWidth={1}
      />
      <rect x={16} y={13} width={26} height={4} rx={2} fill={SOFT_BLUE} />
      <rect x={16} y={22} width={44} height={9} rx={2} fill="var(--ui-brand)" />
      {heights.map((h, i) => (
        <rect
          key={i}
          x={16 + i * 15}
          y={52 - h}
          width={10}
          height={h}
          rx={2}
          fill={i === heights.length - 1 ? 'var(--ui-brand)' : SOFT_BLUE}
        />
      ))}
    </svg>
  );
}

// ── Sección 08 · Mini gráficas: miniaturas de bolsillo (mismas viz, en pequeño) ──

// «Mini · barras por tienda»: 5 barras, las 3 primeras en acento, el resto suaves.
function ThumbMiniStoreBars(): ReactNode {
  const bars = [100, 94, 90, 78, 75];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={8 + i * 24}
          y={60 - (h / 100) * 52}
          width={16}
          height={(h / 100) * 52}
          rx={2.5}
          fill={i < 3 ? 'var(--ui-brand)' : SOFT_BLUE}
        />
      ))}
    </svg>
  );
}

// «Mini · línea de tendencia»: polilínea con punto al final.
function ThumbMiniTrend(): ReactNode {
  const line = 'M6,50 L26,38 L46,42 L66,26 L86,40 L106,22 L126,30';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={126} cy={30} r={3.5} fill="var(--ui-brand)" />
    </svg>
  );
}

// «Mini · área acumulada»: área ascendente (acumulado siempre creciente).
function ThumbMiniArea(): ReactNode {
  const line = 'M6,52 L46,42 L86,28 L126,12';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${line} L126,60 L6,60 Z`} fill="var(--ui-brand-soft)" />
      <path
        d={line}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// «Mini · donut de familias»: rótulo a la izquierda + anillo segmentado a la derecha.
function ThumbMiniDonut(): ReactNode {
  const R = 18;
  const C = 2 * Math.PI * R;
  const segs = [0.46, 0.28, 0.16, 0.1];
  let acc = 0;
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={10} y={20} width={26} height={4} rx={2} fill={SOFT_BLUE} />
      <rect x={10} y={30} width={40} height={11} rx={2} fill="var(--ui-brand)" />
      <g transform="translate(102,32) rotate(-90)">
        {segs.map((f, i) => {
          const len = f * C;
          const node = (
            <circle
              key={i}
              r={R}
              fill="none"
              strokeWidth={9}
              stroke={`color-mix(in oklab, var(--ui-brand) ${100 - i * 24}%, var(--ui-surface))`}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return node;
        })}
      </g>
    </svg>
  );
}

// «Mini · gauge de margen»: semicírculo de capacidad con la cifra al pie.
function ThumbMiniGauge(): ReactNode {
  const arc = 'M18,52 A40,40 0 0 1 114,52';
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={arc}
        fill="none"
        stroke="var(--ui-surface-subtle)"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d={arc}
        fill="none"
        stroke="var(--ui-brand)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray="92 160"
      />
    </svg>
  );
}

// «Mini · top familias»: tres filas (rótulo + riel proporcional).
function ThumbMiniTopFam(): ReactNode {
  const widths = [108, 96, 78];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {widths.map((w, i) => {
        const y = 12 + i * 18;
        return (
          <g key={i}>
            <rect x={6} y={y} width={18} height={6} rx={3} fill={SOFT_BLUE} />
            <rect x={28} y={y} width={6} height={6} rx={3} fill="var(--ui-surface-subtle)" />
            <rect x={28} y={y} width={w - 30} height={6} rx={3} fill="var(--ui-brand)" />
          </g>
        );
      })}
    </svg>
  );
}

// «Mini · heatmap horario»: tira de 11 celdas con intensidad variable.
function ThumbMiniHeatmap(): ReactNode {
  const heat = [0.24, 0.46, 0.62, 0.9, 1, 0.72, 0.5, 0.62, 0.58, 0.6, 0.34];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {heat.map((t, i) => (
        <rect
          key={i}
          x={6 + i * 11.2}
          y={24}
          width={9.5}
          height={16}
          rx={2.5}
          fill={`color-mix(in oklab, var(--ui-brand) ${Math.round(8 + t * 92)}%, var(--ui-surface))`}
        />
      ))}
    </svg>
  );
}

// «Mini · columnas por hora»: columnas con la hora punta en acento.
function ThumbMiniColumns(): ReactNode {
  const heights = [61, 95, 95, 100, 75, 79, 87, 75, 77, 76, 92];
  const peak = heights.indexOf(Math.max(...heights));
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          x={6 + i * 11.2}
          y={58 - (h / 100) * 50}
          width={9}
          height={(h / 100) * 50}
          rx={2}
          fill={
            i === peak
              ? 'var(--ui-brand)'
              : `color-mix(in oklab, var(--ui-brand) 15%, var(--ui-surface))`
          }
        />
      ))}
    </svg>
  );
}

// ── Sección 09 · Listas y tablas: miniaturas de filas (rótulo + valor / badge / chip / checkbox) ──

// Tres filas «rótulo … valor» con divisor fino.
function ThumbTblSimple(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[14, 32, 50].map((y, i) => (
        <g key={i}>
          <rect x={8} y={y - 4} width={52} height={6} rx={3} fill={SOFT_BLUE} />
          <rect x={98} y={y - 4} width={26} height={6} rx={3} fill="var(--ui-brand)" />
          {i < 2 ? (
            <line x1={8} y1={y + 9} x2={124} y2={y + 9} stroke="var(--ui-border)" strokeWidth={1} />
          ) : null}
        </g>
      ))}
    </svg>
  );
}

// Tres filas con avatar cuadrado (el 1º en acento) + rótulo + valor.
function ThumbTblAvatar(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[12, 30, 48].map((y, i) => (
        <g key={i}>
          <rect
            x={8}
            y={y}
            width={14}
            height={14}
            rx={4}
            fill={i === 0 ? 'var(--ui-brand)' : SOFT_BLUE}
          />
          <rect x={28} y={y + 4} width={60} height={6} rx={3} fill={SOFT_BLUE} />
          <rect x={108} y={y + 4} width={16} height={6} rx={3} fill="var(--ui-brand)" />
        </g>
      ))}
    </svg>
  );
}

// Tres filas con rótulo + badge de estado (danger / warning / success).
function ThumbTblStatus(): ReactNode {
  const tones = ['var(--ui-danger)', 'var(--ui-warning)', 'var(--ui-success)'];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[14, 32, 50].map((y, i) => (
        <g key={i}>
          <rect x={8} y={y - 4} width={48} height={6} rx={3} fill={SOFT_BLUE} />
          <rect x={92} y={y - 6} width={32} height={12} rx={6} fill={tones[i]} opacity={0.9} />
          {i < 2 ? (
            <line x1={8} y1={y + 9} x2={124} y2={y + 9} stroke="var(--ui-border)" strokeWidth={1} />
          ) : null}
        </g>
      ))}
    </svg>
  );
}

// Tres filas con rótulo + variación con flecha (▲ verde / ▲ verde / ▼ roja).
function ThumbTblVariation(): ReactNode {
  const rows = [
    { c: 'var(--ui-success)', up: true },
    { c: 'var(--ui-success)', up: true },
    { c: 'var(--ui-danger)', up: false },
  ];
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {rows.map((r, i) => {
        const y = 14 + i * 18;
        const tri = r.up
          ? `${100},${y + 2} ${106},${y - 5} ${112},${y + 2}`
          : `${100},${y - 5} ${106},${y + 2} ${112},${y - 5}`;
        return (
          <g key={i}>
            <rect x={8} y={y - 4} width={56} height={6} rx={3} fill={SOFT_BLUE} />
            <polygon points={tri} fill={r.c} />
            <rect x={116} y={y - 4} width={10} height={5} rx={2.5} fill={r.c} />
            {i < 2 ? (
              <line
                x1={8}
                y1={y + 9}
                x2={124}
                y2={y + 9}
                stroke="var(--ui-border)"
                strokeWidth={1}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// Tres filas con chip de puesto (1 en acento) + rótulo + valor.
function ThumbTblRanking(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[12, 30, 48].map((y, i) => (
        <g key={i}>
          <rect
            x={8}
            y={y}
            width={13}
            height={13}
            rx={3.5}
            fill={i === 0 ? 'var(--ui-brand)' : SOFT_BLUE}
          />
          <rect x={28} y={y + 4} width={58} height={6} rx={3} fill={SOFT_BLUE} />
          <rect x={104} y={y + 4} width={20} height={6} rx={3} fill="var(--ui-brand)" />
        </g>
      ))}
    </svg>
  );
}

// Tres filas con checkbox (1ª hecha = acento) + rótulo (1º tachado).
function ThumbTblTasks(): ReactNode {
  return (
    <svg
      viewBox="0 0 132 64"
      className="wg-thumb-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[12, 30, 48].map((y, i) => (
        <g key={i}>
          <rect
            x={8}
            y={y}
            width={13}
            height={13}
            rx={3.5}
            fill={i === 0 ? 'var(--ui-brand)' : 'none'}
            stroke={i === 0 ? 'none' : 'var(--ui-border-strong)'}
            strokeWidth={1.5}
          />
          <rect
            x={28}
            y={y + 4}
            width={84}
            height={6}
            rx={3}
            fill={i === 0 ? 'var(--ui-surface-subtle)' : SOFT_BLUE}
          />
          {i === 0 ? (
            <line
              x1={28}
              y1={y + 7}
              x2={112}
              y2={y + 7}
              stroke="var(--ui-text-muted)"
              strokeWidth={1.5}
            />
          ) : null}
        </g>
      ))}
    </svg>
  );
}

// Entradas de la galería (se amplía por tandas).
export const GALLERY_ENTRIES: readonly GalleryEntry[] = [
  // Sección 01 · KPIs
  {
    id: 'kpi-grid-connected',
    label: 'KPIs · rejilla conectada',
    category: 'kpis',
    description: 'Banda de 6 métricas con sparkline',
    thumbnail: <ThumbKpiGrid />,
  },
  {
    id: 'kpi-classic',
    label: 'KPI · tarjeta clásica',
    category: 'kpis',
    description: 'Una cifra con chip y tendencia',
    thumbnail: <ThumbKpiCard />,
  },
  // Sección 02 · Gráficas
  {
    id: 'dash-bars',
    label: 'Ventas',
    category: 'graficas',
    description: 'Facturación por tienda',
    thumbnail: <ThumbBars />,
  },
  {
    id: 'dash-hour',
    label: 'Ventas por hora',
    category: 'graficas',
    description: 'Distribución horaria del día',
    thumbnail: <ThumbHours />,
  },
  {
    id: 'graf-hour-area',
    label: 'Distribución horaria',
    category: 'graficas',
    description: 'Facturación por franja, con pico marcado',
    thumbnail: <ThumbHourArea />,
  },
  {
    id: 'graf-store-bars',
    label: 'Ventas por tienda',
    category: 'graficas',
    description: 'Barras de facturación neta por tienda',
    thumbnail: <ThumbBars />,
  },
  {
    id: 'graf-heatmap',
    label: 'Mapa de calor horario',
    category: 'graficas',
    description: 'Intensidad de ventas por hora',
    thumbnail: <ThumbHeatmap />,
  },
  // Sección 03 · Listas
  {
    id: 'lista-familia',
    label: 'Ventas por familia',
    category: 'listas',
    description: 'Ranking de familias con barra y cuota',
    thumbnail: <ThumbLeaderboard />,
  },
  {
    id: 'lista-rankings',
    label: 'Rankings',
    category: 'listas',
    description: 'Top productos por ventas, margen o rotación',
    thumbnail: <ThumbRankTabs />,
  },
  {
    id: 'lista-mix',
    label: 'Mix de ventas',
    category: 'listas',
    description: 'Barra apilada monocroma por familia',
    thumbnail: <ThumbShareBar />,
  },
  // Sección 05 · Compactos
  {
    id: 'cmp-ribbon',
    label: 'Banda compacta de métricas',
    category: 'compactos',
    description: 'Facturación, tickets y ticket medio',
    thumbnail: <ThumbRibbon />,
  },
  {
    id: 'cmp-donut',
    label: 'Donut por familia',
    category: 'compactos',
    description: 'Anillo de reparto por familia',
    thumbnail: <ThumbDonut />,
  },
  {
    id: 'cmp-treemap',
    label: 'Treemap compacto',
    category: 'compactos',
    description: 'Mapa de área en tile pequeño',
    thumbnail: <ThumbTreemap />,
  },
  {
    id: 'cmp-leaderboard',
    label: 'Top vendedores',
    category: 'compactos',
    description: 'Ranking de vendedores',
    thumbnail: <ThumbLeaderboard />,
  },
  {
    id: 'cmp-hero',
    label: 'Cifra-héroe',
    category: 'compactos',
    description: 'La cifra del periodo, en grande',
    thumbnail: <ThumbHero />,
  },
  // Sección 06 · Diagnóstico
  {
    id: 'diag-actividad',
    label: 'Actividad (alertas)',
    category: 'diagnostico',
    description: 'Línea de tiempo de alertas de stock',
    thumbnail: <ThumbActivity />,
  },
  // Sección 07 · KPIs · más formatos
  {
    id: 'kpi-dual',
    label: 'KPI dual',
    category: 'kpis-formatos',
    description: 'Dos métricas apiladas en una tarjeta',
    thumbnail: <ThumbKpiDual />,
  },
  {
    id: 'kpi-area',
    label: 'KPI con área',
    category: 'kpis-formatos',
    description: 'Cifra con área de tendencia',
    thumbnail: <ThumbKpiArea />,
  },
  {
    id: 'kpi-alerta',
    label: 'KPI de alerta',
    category: 'kpis-formatos',
    description: 'Venta perdida por roturas (rojo)',
    thumbnail: <ThumbKpiAlert />,
  },
  {
    id: 'kpi-7dias',
    label: 'KPI 7 días',
    category: 'kpis-formatos',
    description: 'Cifra con mini-barras recientes',
    thumbnail: <ThumbKpi7d />,
  },
  // Sección 08 · Mini gráficas
  {
    id: 'mini-tiendas',
    label: 'Mini · barras por tienda',
    category: 'mini',
    description: 'Facturación de hoy por tienda',
    thumbnail: <ThumbMiniStoreBars />,
  },
  {
    id: 'mini-tendencia',
    label: 'Mini · línea de tendencia',
    category: 'mini',
    description: 'Tendencia del ticket medio',
    thumbnail: <ThumbMiniTrend />,
  },
  {
    id: 'mini-acumulado',
    label: 'Mini · área acumulada',
    category: 'mini',
    description: 'Beneficio acumulado del periodo',
    thumbnail: <ThumbMiniArea />,
  },
  {
    id: 'mini-donut',
    label: 'Mini · donut de familias',
    category: 'mini',
    description: 'Reparto por familia, en anillo',
    thumbnail: <ThumbMiniDonut />,
  },
  {
    id: 'mini-gauge',
    label: 'Mini · gauge de margen',
    category: 'mini',
    description: '% de margen como capacidad',
    thumbnail: <ThumbMiniGauge />,
  },
  {
    id: 'mini-familias',
    label: 'Mini · top familias',
    category: 'mini',
    description: 'Las 3 familias top, en riel',
    thumbnail: <ThumbMiniTopFam />,
  },
  {
    id: 'mini-heatmap',
    label: 'Mini · heatmap horario',
    category: 'mini',
    description: 'Intensidad por hora (7h→17h)',
    thumbnail: <ThumbMiniHeatmap />,
  },
  {
    id: 'mini-columnas',
    label: 'Mini · columnas por hora',
    category: 'mini',
    description: 'Ventas por hora; punta en acento',
    thumbnail: <ThumbMiniColumns />,
  },
  // Sección 09 · Listas y tablas
  {
    id: 'tabla-simple',
    label: 'Ventas por tienda (lista)',
    category: 'listas-tablas',
    description: 'Facturación de hoy por tienda',
    thumbnail: <ThumbTblSimple />,
  },
  {
    id: 'tabla-avatar',
    label: 'Vendedores (con avatar)',
    category: 'listas-tablas',
    description: 'Vendedores con iniciales y tickets',
    thumbnail: <ThumbTblAvatar />,
  },
  {
    id: 'tabla-estado',
    label: 'Estado de stock',
    category: 'listas-tablas',
    description: 'Productos con badge Agotado/Bajo/OK',
    thumbnail: <ThumbTblStatus />,
  },
  {
    id: 'tabla-variacion',
    label: 'Variación por tienda',
    category: 'listas-tablas',
    description: 'Tiendas con ▲/▼ frente a ayer',
    thumbnail: <ThumbTblVariation />,
  },
  {
    id: 'tabla-ranking',
    label: 'Ranking de productos (tabla)',
    category: 'listas-tablas',
    description: 'Top de productos con puesto y €',
    thumbnail: <ThumbTblRanking />,
  },
  {
    id: 'tabla-tareas',
    label: 'Tareas de reposición',
    category: 'listas-tablas',
    description: 'Checklist de reposición por alertas',
    thumbnail: <ThumbTblTasks />,
  },
];
