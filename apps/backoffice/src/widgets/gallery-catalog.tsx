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
    id: 'graf-heatmap',
    label: 'Mapa de calor horario',
    category: 'graficas',
    description: 'Intensidad de ventas por hora',
    thumbnail: <ThumbHeatmap />,
  },
];
