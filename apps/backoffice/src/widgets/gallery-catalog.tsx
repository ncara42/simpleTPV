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
    id: 'graf-heatmap',
    label: 'Mapa de calor horario',
    category: 'graficas',
    description: 'Intensidad de ventas por hora',
    thumbnail: <ThumbHeatmap />,
  },
  // Sección 03 · Listas
  {
    id: 'lista-familia',
    label: 'Reparto por familia',
    category: 'listas',
    description: 'Cuotas de facturación por familia',
    thumbnail: <ThumbShareBar />,
  },
  {
    id: 'lista-rankings',
    label: 'Ranking de productos',
    category: 'listas',
    description: 'Top de productos más vendidos',
    thumbnail: <ThumbLeaderboard />,
  },
  {
    id: 'lista-mix',
    label: 'Mix por familia (treemap)',
    category: 'listas',
    description: 'Mapa de área por familia',
    thumbnail: <ThumbTreemap />,
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
];
