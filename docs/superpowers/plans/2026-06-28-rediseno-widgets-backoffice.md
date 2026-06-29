# Rediseño de widgets del dashboard (backoffice) — «Fundación Geist»

> Plan vivo y **autónomo**. Se sube al repo para poder retomar desde otro equipo.
> Origen: handoff de Claude Design «SimpleTPV Widgets.dc.html»
> (proyecto `264c1a67-5aa2-457c-b315-193fe16ad34e`). Idioma: español de España.

## Estado global (2026-06-28)

Trabajo integrado en **`main`** (2026-06-29). **Hecho: tandas 0–11** (37 widgets nuevos + 2 clásicos
conservados, las 11 categorías de la galería pobladas). Cada tanda con su test (datos mock + paridad) y la
puerta verde (typecheck + lint + unit + build). Las Tandas 8, 9, 10 y 11 además verificadas por captura
propia vs. el handoff. **Recorrido del handoff COMPLETO.** Diferidos por falta de endpoint honesto (sin
fabricar datos): Tanda 4 entera, `mini-pago`/`mini-objetivo` (T8), `esp-embudo`/`esp-calendario` (T11).

> ✅ **Divergencia con `main` resuelta (2026-06-29):** las tandas 8–9 se rebasaron sobre `main` (que ya
> traía `graf-hour-area`/`graf-store-bars`/`SalesMix`); conflicto único trivial en el import de `listas.js`.
> La tanda 10 ya parte de `main`. De paso, el rebase recuperó el commit «radio Vercel» que un push con
> `--force` desde base vieja había dejado fuera de `origin/main`.

### 🎯 MÉTODO CORRECTO (corrección del usuario, 2026-06-28): replicar el handoff PÍXEL A PÍXEL

Reutilizar las moléculas de `@simpletpv/ui` (KpiStat, KpiGrid, …) **NO** reproduce el diseño del
handoff («no se parecen en nada»). El método correcto, validado en la **Tanda 1 reescrita**:

1. Traer el handoff con DesignSync (`get_file` de `SimpleTPV Widgets.dc.html`), desempaquetar el JSON
   a HTML y **renderizar la sección con Playwright** para VERLA (captura).
2. Leer el markup/estilos inline EXACTOS de esa sección (tamaños, colores, paddings, viewBox de los SVG).
3. Construir componentes **a medida** que repliquen ese markup, con CSS por **token** (`--ui-*`/`--gst-*`,
   que valen exactamente los hex del handoff → pixel-perfect en claro + correcto en oscuro). Panel
   **sin chrome** (`PanelShell bare`) para los widgets a sangre / con tarjeta propia.
4. Enlazar a datos reales (valores + series que existan); **no fabricar** lo que la API no da.
5. Verificar con captura propia vs. la del handoff.

Ejemplo de referencia: `widgets/panels/kpis.tsx` + `widgets/panels/kpi-grid.css` (rejilla conectada por
hairline + tarjeta clásica, réplica exacta de la sección 01).

⚠️ **Tandas 2, 3, 5, 6, 7 están hechas con el atajo de moléculas** → probablemente NO casan con el
handoff. **Pendiente: rehacerlas pixel-perfect** con el método de arriba (una sección del handoff por
tanda). El usuario solo ha revisado la 1 hasta ahora.

⚠️ **Verificación visual:** la Tanda 1 reescrita SÍ está verificada por captura vs. el handoff. El resto
solo por test unitario + build; revisar en claro/oscuro a 1440/768/375 y la galería del `+` antes del PR.

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
- **Tanda 1 · 01 KPIs (2)** ✅ **REESCRITA pixel-perfect** — réplica exacta del handoff: rejilla de 6
  celdas conectadas por hairline de 1px (chip de delta con flecha/color + sparkline a sangre coloreado
  por sentido) y tarjeta clásica con esquina «A · CLÁSICA». Componentes a medida en `panels/kpis.tsx` +
  CSS por token en `panels/kpi-grid.css` (`PanelShell` con prop `bare`). Verificada por captura vs.
  handoff. Nota: Facturación, Venta perdida y la clásica salen sin sparkline (la API no da serie diaria
  de revenue/roturas); el resto sí. Las 4 sparklines restantes y todo el estilo son fieles.
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
- **Tanda 8 · 08 Mini gráficas (10)** ✅ **pixel-perfect (a medida, tiles 3×1)** — réplica del handoff con
  componentes propios + CSS por token (`panels/mini.tsx` + `panels/mini.css` + `panels/mini.test.tsx`).
  **8 construidos** con datos reales: `mini-tiendas` (barras, `getSalesToday.byStore`), `mini-tendencia`
  (línea, serie de ticket medio de `getSalesKpis`), `mini-acumulado` (área, suma acumulada de
  `realMarginSeries`), `mini-donut` (anillo, `getSalesByFamily`), `mini-gauge` (semicírculo, `marginPct`),
  `mini-familias` (riel top-3 familia), `mini-heatmap` (tira 11 celdas 7→17h, `getSalesByHourOnDay`),
  `mini-columnas` (columnas por hora, punta en acento). Verificado por captura propia (harness temporal)
  vs. el handoff. **2 DIFERIDOS por falta de endpoint:** _Stacked · pago_ (desglose por método de pago, sin
  endpoint — mismo bloqueo que T4) y _Bullet · objetivo_ (necesita un OBJETIVO/target de ventas, sin
  endpoint de metas). No fabricar; implementar cuando exista el dato.
- **Tanda 9 · 09 Listas y tablas (6)** ✅ **pixel-perfect (a medida)** — `panels/tabla.tsx` +
  `panels/tabla.css` + `panels/tabla.test.tsx`, tiles 4×2. Los 6 con datos reales: `tabla-simple`
  (ventas por tienda, `getSalesToday.byStore`), `tabla-avatar` (vendedores con iniciales + tickets,
  `getSalesByEmployee`), `tabla-estado` (badge Agotado/Bajo/OK desde `listAlerts`), `tabla-variacion`
  (tiendas con ▲/▼ del deltaPct), `tabla-ranking` (top productos con puesto + €, `getProductRankings`),
  `tabla-tareas` (checklist de reposición desde `listAlerts`; resueltas tachadas). Hasta 6 filas por
  tarjeta. Verificado por captura propia vs. el handoff. Nota: `eur0` con `useGrouping:'always'` para que
  las cifras de 4 cifras lleven separador de miles como el handoff.
- **Tanda 10 · 10 Estado y progreso (3)** ✅ **pixel-perfect (a medida)** — `panels/estado.tsx` +
  `estado.css` + `estado.test.tsx`. Los 3 con datos reales: `estado-pasos` (stepper del ciclo de un
  pedido de compra `DRAFT→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED` = Pedido→Aprob.→Envío→Recib., vía
  `listPurchaseOrders`), `estado-operativo` (tiendas `active && opsVerified && !opsIncident` sobre activas,
  vía `listStores`), `estado-cumplimiento` (checklist: `verifyVerifactuChain().ok` + `listPendingCashMovements`
  vacío = cajas cuadradas). Tonos success/warning/muted por token; estado de carga = muted (sin falso
  rojo). Verificado por captura propia vs. el handoff.
- **Tanda 11 · 11 Especializados (6 → 4 hechos, 2 diferidos)** ✅ **pixel-perfect (a medida)** —
  `panels/especializados.tsx` + `especializados.css` + `especializados.test.tsx`. Construidos con datos
  reales: `esp-proveedores` (`compareSupplierPrices`: mejor precio marcado + competidor más barato),
  `esp-matriz` (tienda × franja Mañana/Mediodía/Tarde, fan-out `getSalesByHourOnDay` por tienda con
  `useQueries`; intensidad por `color-mix`), `esp-tiendas` (`listStores`: dirección + estado operativo),
  `esp-resumen-ejecutivo` (banner mensual: `getSalesKpis`+`getMarginKpis`+`getStockoutKpis` + rango del mes
  anterior para el MoM del ritmo diario; `marginPct` es fracción → `style:percent`). **Diferidos:**
  `esp-embudo` (no hay conteo honesto de «con venta»/«top») y `esp-calendario` (no hay serie de ventas por
  día del mes). Verificado por captura propia vs. el handoff.

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
