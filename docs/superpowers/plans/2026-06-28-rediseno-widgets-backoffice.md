# Rediseño de widgets del dashboard (backoffice) — «Fundación Geist»

> Plan vivo y **autónomo**. Se sube al repo para poder retomar desde otro equipo.
> Origen: handoff de Claude Design «SimpleTPV Widgets.dc.html»
> (proyecto `264c1a67-5aa2-457c-b315-193fe16ad34e`). Idioma: español de España.

## Objetivo

Rehacer la galería de widgets del dashboard del **backoffice** con el lenguaje visual
«Fundación Geist» (tarjetas planas, hairlines `#e8e8eb`, único acento azul `#0070f3`,
dataviz monocromática azul+gris, tipografía Geist/Geist Mono, `tabular-nums`, radios 12px,
semánticos success `#117a3b` / warning `#ab5300` / danger `#d6201f`). Los tokens YA existen en
`packages/ui/src/styles/theme-geist.css` (`--ui-*` / `--gst-*`, claro/oscuro vía `data-theme`):
**se consumen, no se duplican**.

## Lo que pidió el usuario (3 cosas)

1. **Empezar de cero:** borrar todos los widgets actuales salvo `dash-bars` («Ventas») y
   `dash-hour` («Ventas por hora»). ✅ (Tanda 0)
2. **Lienzo vacío sin el botón central** ni el texto «Lienzo en blanco · añade los widgets que
   quieras». Se conserva el `+` de la topbar. ✅ (Tanda 0)
3. **El `+` abre una ventana GRÁFICA** (tarjetas con miniatura), no la lista de texto de antes. ✅
   (Tanda 0: `WidgetGalleryModal`)

## Decisiones bloqueadas

- **47 widgets** en total, taxonomía = las **11 secciones** del handoff (ver roadmap abajo).
  El recuento de 47 **incluye** los 2 conservados (`dash-bars`, `dash-hour`) y los 2 de KPIs ya
  hechos → quedan **43 nuevos** por construir (secciones 02→11).
- La galería es un **modal centrado** (overlay que atenúa el fondo), portal a `document.body`.
- **Cada alternativa/tratamiento del handoff = un widget independiente** con su propio id.
- Las **categorías de la galería = las 11 secciones** del handoff.
- **Modo autónomo (2026-06-28):** el usuario cambia de equipo y no podrá dar el visto bueno por
  tanda. Se procede sin esperar aprobación: implementar, verificar (puerta completa), **commit +
  push por tanda**, y actualizar este plan. La puerta verde es la garantía de calidad.

## Arquitectura (dónde vive cada cosa)

Para **añadir un widget** hay que tocar 4 sitios (3 de catálogo + 1 de render) y un test:

| Pieza                 | Fichero                                                                                               | Qué se añade                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Etiqueta (catálogo)   | `apps/backoffice/src/widgets/registry.ts` → `WIDGET_LABELS`                                           | `'<id>': 'Nombre visible'`                        |
| Tamaño en el lienzo   | `apps/backoffice/src/lib/dashboard-layout.ts` → `ITEM_SPECS`                                          | `'<id>': { w, h }` (cols de 12, filas)            |
| Categoría + miniatura | `apps/backoffice/src/widgets/gallery-catalog.tsx` → `GALLERY_ENTRIES` (+ un `Thumb*` SVG)             | `{ id, label, category, description, thumbnail }` |
| **Render**            | `apps/backoffice/src/widgets/panels/<seccion>.tsx` + registro en `panels/index.tsx` → `WIDGET_PANELS` | componente `({ period, store }) => ReactElement`  |

El despacho de render está en `apps/backoffice/src/DashboardPage.tsx` (`renderItem`): tras la rama
`gen:*` consulta `WIDGET_PANELS[id]` y, si existe, renderiza `<Panel period={period} store={store} />`.
Los clásicos `dash-bars`/`dash-hour` siguen su rama propia (no están en `WIDGET_PANELS`).

**Tests de paridad (mantienen el sistema coherente, se auto-mantienen por tandas):**

- `widgets/panels/kpis.test.tsx`: cada `PANEL_RENDER_IDS` ∈ `ITEM_SPECS` ∧ `WIDGET_LABELS`.
- `components/WidgetGalleryModal.test.tsx`: cada `GALLERY_ENTRIES.id` ∈ `ITEM_SPECS`.
- `widgets/registry.test.tsx`: fijos del registro = `['dash-bars','dash-hour', ...PANEL_RENDER_IDS]`.
- `lib/dashboard-layout.test.ts`: `presentes ∪ disponibles = catálogo` (sin solape).

## Plantilla de un panel (copiar de `panels/kpis.tsx`)

```tsx
import {} from /* molécula */ '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import {} from /* hook(s) de datos */ '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Estado de carga/error → las moléculas reciben `state`, no isLoading.
type LoadState = 'loading' | 'error' | undefined;
function loadState(q: { isLoading: boolean; isError: boolean }): LoadState {
  if (q.isError) return 'error';
  if (q.isLoading) return 'loading';
  return undefined;
}

export function MiWidget({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['clave', period, store],
    queryFn: () => getAlgo(period, store),
    placeholderData: keepPreviousData,
  });
  const st = loadState(q);
  return (
    <PanelShell id="mi-widget" /* fill si llena el tile */>
      {/* molécula con q.data y {...(st ? { state: st } : {})} */}
    </PanelShell>
  );
}
```

- `PanelShell` (`panels/PanelShell.tsx`): aplica `.dash-panel` (+ `.dash-panel--fill`) y un cuerpo
  `.dash-widget-body`. `fill` para rejillas/áreas/sparklines a sangre; sin `fill` para cifras/donuts.
- `PanelProps` (`panels/types.ts`): `{ period: DashboardPeriod; store?: string }`.
- Reusar el `queryKey` exacto entre widgets que comparten endpoint (cache compartida).

## Piezas disponibles

**Hooks de datos** — `apps/backoffice/src/lib/dashboard.ts`: `getSalesKpis`, `getMarginKpis`,
`getStockoutKpis`, `getSalesToday`, `getSalesByFamily`, `getSalesByHourOnDay`, `getSalesByEmployee`,
`getDiscountByEmployee`, `getProductRankings`, `getProductRotation`, `getArchetypeRotation`.
`apps/backoffice/src/lib/stock.ts`: `listAlerts`. (Si un widget del handoff no tiene endpoint, usar
datos derivados de los existentes o marcarlo «necesita endpoint» en este plan; no inventar fetch.)

**Moléculas dataviz** — `@simpletpv/ui` (`packages/ui/src/components/dataviz/`):
`KpiStat`, `KpiGrid`/`KpiRow`/`HeroSplit` (layout), `KpiTile`, `KpiDual`, `Sparkline`, `SparkArea`,
`SparkBars`, `RibbonStat`, `DonutStat`, `Gauge`, `BulletMeter`, `Treemap`, `Leaderboard`,
`HeatStrip`, `HeroFigure`, `ProjectionArea`, `ShareBar`, `ActivityFeed`. CSS: `packages/ui/src/styles/dataviz.css`.

## Roadmap por tandas (estado e ids)

Una tanda = una sección. Ids propuestos en _cursiva_ (ajustar al construir según el handoff).

- **Tanda 0 · Cimientos** ✅ — limpieza, modal galería (`WidgetGalleryModal` + `widget-gallery-modal.css`
  - `gallery-catalog.tsx`), cableado del `+`, lienzo vacío sin botón central.
- **Tanda 1 · 01 KPIs (2)** ✅ — `kpi-grid-connected` (KpiGrid bleed de 6 KpiStat),
  `kpi-classic` (KpiStat variant card). `panels/kpis.tsx` + `panels/kpis.test.tsx`.
- **Tanda 2 · 02 Gráficas (3)** ✅ — `dash-hour` (área horaria) y `dash-bars` (ventas por tienda)
  ya existían; **nuevo**: `graf-heatmap` (HeatStrip de la hora punta, `getSalesByHourOnDay` del día de
  hoy, comparte `queryKey` 'dash-hour'). `panels/graficas.tsx` + `panels/graficas.test.tsx`.
- **Tanda 3 · 03 Listas (3)** ✅ — `lista-familia` (ShareBar, `getSalesByFamily`),
  `lista-rankings` (Leaderboard, `getProductRankings.topSales`), `lista-mix` (Treemap, `getSalesByFamily`).
  `panels/listas.tsx` + `panels/listas.test.tsx`. (El test de categoría vacía del modal ahora elige
  la categoría sin widgets dinámicamente, para no romperse en cada tanda.)
- **Tanda 4 · 04 Más exploraciones (4)** ⛔ DEFERIDA (faltan datos en `lib/dashboard.ts`) — _exp-objetivo_
  (BulletMeter) necesita un OBJETIVO/target (no existe endpoint de metas); _exp-metodos-pago_ (DonutStat)
  necesita desglose por método de pago (sin endpoint); _exp-tickets-recientes_ (ActivityFeed) necesita la
  lista de tickets individuales (la lib de dashboard no la expone; existe en otra API de ventas);
  _exp-acumulado-mes_ (ProjectionArea) necesita una serie diaria ACUMULADA del mes — la semántica de
  `series`/`intraday` de `getSalesToday` no está verificada. **No fabricar datos**: implementar cuando
  haya endpoint, o portar la lista de tickets desde la API de ventas.
- **Tanda 5 · 05 Compactos (5)** ✅ — `cmp-ribbon` (RibbonStat ×3 de `getSalesKpis`), `cmp-donut`
  (DonutStat de `getSalesByFamily`), `cmp-treemap` (Treemap de familia), `cmp-leaderboard` (Leaderboard
  de `getSalesByEmployee`), `cmp-hero` (HeroFigure de `getSalesKpis` + serie de `getMarginKpis`).
  `panels/compactos.tsx` + `panels/compactos.test.tsx`.
- **Tanda 6 · 06 Diagnóstico (1)** ✅ — `diag-actividad` (ActivityFeed de `listAlerts`, tono por
  severidad de la alerta). `panels/diagnostico.tsx` + `panels/diagnostico.test.tsx`.
- **Tanda 7 · 07 KPIs · más formatos (4)** ✅ — `kpi-dual` (KpiDual: Facturación + Beneficio),
  `kpi-area` (KpiStat card + SparkArea de % Margen), `kpi-alerta` (KpiStat card tono danger,
  `getStockoutKpis`), `kpi-7dias` (KpiStat card + SparkBars de los últimos 7 de `realMarginSeries`).
  `panels/kpis-formatos.tsx` + `panels/kpis-formatos.test.tsx`.
- **Tanda 8 · 08 Mini gráficas (10)** ⬜ — _mini-01..10_: sparkline/sparkbars/sparkarea/gauge/donut
  mini en tiles 3×1 (variaciones de tratamiento; detalle al abrir el handoff).
- **Tanda 9 · 09 Listas y tablas (6)** ⬜ — _tabla-simple_, _tabla-variacion_, _tabla-avatar_,
  _tabla-estado_, _tabla-ranking_, _tabla-tareas_.
- **Tanda 10 · 10 Estado y progreso (3)** ⬜ — _estado-pasos_, _estado-operativo_, _estado-cumplimiento_
  (Gauge/BulletMeter/stepper).
- **Tanda 11 · 11 Especializados (6)** ⬜ — _esp-proveedores_, _esp-matriz_, _esp-embudo_, _esp-tiendas_,
  _esp-calendario_, _esp-resumen-ejecutivo_.

## Puerta de verificación (por tanda, obligatoria antes de commit)

```bash
cd /home/.../simpleTPV
pnpm -C apps/backoffice typecheck
pnpm exec eslint <ficheros nuevos/cambiados>
pnpm -C apps/backoffice test            # vitest, todo verde
pnpm -C apps/backoffice build           # build de producción (resuelve CSS/bundle)
```

Cada tanda añade un test de la sección (datos mockeados + paridad). Commit Conventional Commits
(`feat(backoffice): …`) y `git push`. Actualizar el estado de la tanda en este fichero.

## Cómo retomar desde otro equipo

1. `git fetch origin && git switch feat/rediseno-widgets-backoffice` (toda la obra va en esta rama
   de `origin`, NO en `main`; se integrará por PR al terminar). `pnpm install` si hace falta.
2. Leer este plan: arquitectura + plantilla + roadmap (la última tanda con ✅ es lo hecho).
3. Implementar la siguiente tanda ⬜ siguiendo «Plantilla de un panel» y los 4 puntos de catálogo.
4. Pasar la puerta de verificación; commit + push a la rama; marcar la tanda.
5. Para el detalle visual exacto de cada widget, abrir el handoff de Claude Design (proyecto
   `264c1a67-5aa2-457c-b315-193fe16ad34e`, fichero `SimpleTPV Widgets.dc.html`).
