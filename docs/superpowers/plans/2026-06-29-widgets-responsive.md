# Plan: widgets responsivos (sin «banda blanca» al redimensionar)

> Plan vivo. Objetivo: que los 39 widgets del rediseño «Fundación Geist» llenen su tile a
> anchuras/alturas ligeramente distintas a su tamaño natural, formando retículas irregulares
> bonitas **sin huecos blancos adheridos**. Idioma: español de España.

## Síntoma

Al redimensionar un widget en el lienzo libre se le añade un fragmento blanco (una «franja
adyacente y adherida») en vez de adaptarse. Algunos widgets sí se adaptan bien; la mayoría no.

## Causa raíz (verificada en código)

1. **El tile ya es responsivo.** `FreeBoard.tsx:1295` renderiza cada elemento en una caja de
   `width: el.w; height: el.h` (píxeles) y `dashboard.css:1240` estira su hijo (el `.dash-panel`)
   a `width:100%; height:100%`. El contenedor NO es el problema.
2. **El relleno del contenido es binario y escaso.** Solo `.dash-panel--fill` propaga el alto:
   `dashboard.css:257` da `flex:1; min-height:0` al `.dash-widget-body` y `:263` estira su hijo.
   Sin `fill`, `.dash-widget-body` solo tiene `min-width:0` (`:254`) → el contenido se pinta a su
   **altura natural, alineado arriba**, y como `.dash-panel` (no-bare) tiene `background:
var(--ui-surface)` y se estira al tile → **banda blanca debajo del contenido**. En los `bare`
   (mini/tabla/estado/especializados) la tarjeta propia (`.mw-card`/`.tl-card`/…) queda a su altura
   natural y deja hueco igualmente.
3. **Alturas fijas en px** que no redistribuyen: `mini.css` viz `64px` (`:44,:58,:74,:156`),
   gauge `60–62px`, donut `aspect-ratio:1`; badges/celdas con `height` fijo en tabla/estado/esp.
4. **`fill` lo usan solo unos pocos** (`diagnostico`, `graficas` store-bars, `compactos`, KPIs área).
   El resto (KPIs sección 01, mini ×8, tablas ×6, estado ×3, especializados ×4, donuts/cifras)
   renderiza natural → es donde aparece la franja.

Conclusión: hay que pasar de un flag `fill` binario a un **contrato de relleno responsivo** que cada
widget cumpla, decidiendo por arquetipo si su contenido **se estira** o **se centra** en el tile.

## Objetivo / criterios de éxito

- Ningún widget muestra hueco/banda blanca a tamaños razonables (de ~0.8× a ~1.6× su tamaño base).
- El contenido se reparte (listas/tablas/rejillas/gráficas) o se centra (figuras: cifra, donut,
  gauge, badge) ocupando todo el tile con aire equilibrado.
- Anchura responsiva: los SVG escalan por `viewBox`+`preserveAspectRatio`; rejillas por `fr/minmax`.
- Sin regresiones pixel-perfect a su tamaño «de catálogo» (las capturas vs. handoff siguen casando).
- Verificado por captura a varios tamaños de tile.

## Diseño

### 1. `PanelShell`: de `fill: boolean` a `fit: 'stretch' | 'center' | 'natural'`

`apps/backoffice/src/widgets/panels/PanelShell.tsx`

- Nuevo prop `fit` (default **`'stretch'`**). Se mantiene `bare`. `fill` se conserva como alias
  deprecado de `fit="stretch"` durante la migración (un commit lo retira al final).
- Render: `className` añade `dash-panel--fit-${fit}`. El cuerpo (`.dash-widget-body`) **siempre**
  llena el tile; `fit` decide cómo se comporta su contenido.

### 2. Contrato CSS base (en `dashboard.css`, reemplaza las reglas `--fill`)

```css
/* El panel SIEMPRE es una columna que llena el tile. */
.dash-panel {
  display: flex;
  flex-direction: column;
}
.dash-widget-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* stretch: el contenido crece para llenar (listas, tablas, rejillas, gráficas, stepper, matriz). */
.dash-panel--fit-stretch > .dash-widget-body > * {
  flex: 1;
  min-height: 0;
}

/* center: figura de tamaño intrínseco centrada; el espacio sobrante = aire equilibrado. */
.dash-panel--fit-center > .dash-widget-body {
  display: grid;
  place-items: center;
}

/* natural (raro): alto de contenido, pero centrado vertical para no dejar banda arriba/abajo. */
.dash-panel--fit-natural > .dash-widget-body {
  justify-content: center;
}
```

Las tarjetas a medida (`.mw-card`/`.tl-card`/`.st-card`/`.sp-card`) pasan a `height:100%` real
(ahora resuelven contra un cuerpo ya estirado) y a `display:flex; flex-direction:column`.

### 3. Clasificación por arquetipo (qué `fit` lleva cada widget)

**STRETCH (el contenido se reparte para llenar):**

- `kpi-grid-connected` (la rejilla de 6 celdas se estira; celdas `flex:1`).
- `graf-hour-area`, `graf-store-bars`, `graf-heatmap` (las gráficas miden su contenedor — ya casi).
- `lista-familia`, `lista-rankings`, `lista-mix`; `cmp-treemap`, `cmp-leaderboard`; `diag-actividad`.
- `tabla-simple/avatar/estado/variacion/ranking/tareas` (filas con `justify-content: space-between`
  o cada fila `flex:1` con tope, para no separar en exceso con pocas filas).
- `estado-pasos` (stepper centrado vertical), `estado-cumplimiento` (filas repartidas).
- `esp-proveedores`, `esp-matriz` (celdas `flex:1`), `esp-tiendas`, `esp-resumen-ejecutivo`.
- mini con viz de barras/línea/columnas/heatmap (`mini-tiendas/tendencia/acumulado/familias/heatmap/columnas`):
  el viz pasa de `height:64px` a `flex:1; min-height:48px`.

**CENTER (figura intrínseca, se centra):**

- `kpi-classic`, `kpi-dual`, `kpi-area`, `kpi-alerta`, `kpi-7dias` (cifra + sparkline → la cifra
  centrada; el sparkline puede estirarse al ancho).
- `cmp-ribbon`, `cmp-donut`, `cmp-hero`.
- `estado-operativo` (ya centrado), `mini-donut`, `mini-gauge` (mantienen `aspect-ratio`, centrados).

### 4. Alturas fijas → flexibles

- `mini.css`: viz (`.mw-bars/.mw-svg/.mw-cols`) `height:64px` → `flex:1; min-height:48px`; donut/gauge
  conservan `aspect-ratio` pero centrados (no estiran).
- Donde haya `height:Npx` de adorno (badges, barras de stepper) se deja; lo que cuenta es el área
  principal del viz.

### 5. Anchura responsiva

- Los SVG ya usan `viewBox` + (la mayoría) `preserveAspectRatio`: revisar que el contenedor sea
  `width:100%` y que los que deban estirar horizontalmente NO fijen `preserveAspectRatio` rígido.
- Rejillas (`kw-grid`, matriz) ya usan `repeat(n, minmax(0,1fr))` → escalan en ancho. Verificar.

### 6. (Opcional) Límites de tamaño por widget

- Añadir `minW/minH` por id en `ITEM_SPECS` (o un mapa nuevo) y aplicarlos como cota en el resize de
  `FreeBoard` para evitar que una tabla quede en 1×1 ilegible. Degradación elegante, no bloqueante.

## Fases (tandas)

- **R0 · Contrato base:** `PanelShell.fit` + reglas CSS base en `dashboard.css` + alias `fill`.
  Por defecto `stretch`. Verificar que nada explota (build + tests).
- **R1 · Figuras → center:** KPIs (clásica/dual/área/alerta/7días), `cmp-ribbon/donut/hero`,
  `mini-donut/gauge`, `estado-operativo`. Captura a 3 tamaños.
- **R2 · Listas/tablas/estado → stretch:** `lista-*`, `tabla-*`, `estado-pasos/cumplimiento`,
  `diag-actividad`, `cmp-leaderboard/treemap`. Repartir filas sin separarlas en exceso.
- **R3 · Mini viz + matriz + gráficas:** alturas `64px`→`flex`, `esp-matriz`/`esp-proveedores`/
  `esp-tiendas`/`esp-resumen`, revisar `graf-*` (medición de contenedor).
- **R4 · (Opcional) min-sizes** en el resize + retirar el alias `fill` deprecado.

Cada tanda: typecheck + lint + unit + build, y **captura propia a 3 tamaños** (mínimo/base/grande)
de cada widget tocado, comparando que (a) no hay banda blanca y (b) el tamaño «base» sigue casando
con el handoff.

## Verificación

- Reutilizar el harness de regresión visual (`apps/backoffice/visual.html`, #211) o un harness nuevo
  que pinte cada widget en 3 cajas (p. ej. `0.8×`, `1×`, `1.5×`) y capturar con Playwright.
- Checklist por widget: sin hueco; contenido centrado/repartido; SVG nítido al escalar; texto sin
  recorte; a 1440/768 y claro/oscuro.

## Riesgos / fuera de alcance

- Riesgo: estirar en exceso listas con pocas filas (se ven «huecas»). Mitigación: `space-between`
  con `gap` máximo o filas con `max-height`, no `flex:1` puro.
- Riesgo: romper el pixel-perfect del tamaño base. Mitigación: el tamaño de catálogo (`ITEM_SPECS`)
  sigue siendo el de referencia; la verificación compara contra el handoff a ese tamaño.
- Fuera de alcance: rediseñar el lienzo/zoom; cambiar `ITEM_SPECS` de catálogo (solo se añaden
  min-sizes opcionales).

## Decisiones tomadas (2026-06-29)

1. **`stretch` por defecto + `center` solo para figuras** (cifras KPI, donut, gauge, badge, hero).
2. **Sí a min-sizes por widget** (fase R4): el resize no deja achicar por debajo de un tamaño legible.
3. **Ejecución por fases R0–R4**, con captura a 3 tamaños (mín/base/grande) entre cada una.

## Estado de ejecución (2026-06-29)

- **R0 ✅** Contrato en `PanelShell` (`fit: 'stretch' | 'center' | 'natural'`, `fill` como alias de
  `stretch`) + reglas `--fit-*` en `dashboard.css`. Durante la migración, sin `fit` ni `fill` el default
  es **`natural`** (centrado vertical: quita la banda sin estirar lo aún no migrado).
- **R1 ✅** Figuras → `center`: `mini-donut`, `mini-gauge`, `estado-operativo`, `kpi-classic`.
  (`cmp-donut`/`cmp-hero` se dejaron en `fill`: como moléculas ya llenaban sin costura.)
- **R2 ✅** Listas/tablas/estado/especializados → `stretch` con distribución: `tabla-*` (filas
  `flex:1`), `estado-pasos`/`cumplimiento` (`st-fill`/`st-checks` centrados), `esp-proveedores`/
  `esp-tiendas` (filas `flex:1`), `esp-matriz` (celdas `grid-auto-rows:1fr`), `esp-resumen` (banner).
- **R3 ✅** Mini-gráficas: `mini-tiendas/tendencia/acumulado/columnas/familias` → `stretch` con viz
  `flex:1; min-height:48px` (línea con `preserveAspectRatio="none"` + `vectorEffect`); `mini-heatmap`
  queda `natural` (centrado). Donut/gauge ya en `center`.
- **R4 ✅ Barrido de completitud** (sustituye al min-size, que es **N/A**: los widgets no tienen tirador
  de resize — solo las notas, `dash-free-note-resize`; sus tamaños vienen de `ITEM_SPECS`). Revisados
  TODOS los widgets de molécula no etiquetados a tile alto; 4 caían a `natural` (centrados, con banda
  gris) y se pasaron a `stretch`: `kpi-grid-connected` (+ `.kw-grid { grid-auto-rows: minmax(118px,1fr) }`),
  `lista-rankings`, `graf-heatmap`, `graf-hour-area`. El resto (`lista-familia`, `lista-mix`, `cmp-ribbon`,
  `diag-actividad`, `graf-store-bars`) ya llenaban. El alias `fill` se mantiene (inocuo).

## Ajustes adicionales (2026-06-29, petición del usuario)

- **Treemap** (`cmp-treemap`): **reprogramado A MEDIDA desde cero** (pixel-perfect del handoff, NO la molécula
  `Treemap` genérica). Componente propio en `compactos.tsx` + `compactos.css` (`.ct-*`): tarjeta plana,
  treemap de 2 filas con área ∝ facturación, rampa azul descendente por rango (`color-mix(brand, surface)`),
  tinta blanca en tonos oscuros / azul muy oscuro en claros, «valor € · %» en tiles grandes y «%» en pequeños
  (nombres ENVUELVEN, no truncan — como el handoff). `fit="stretch" bare` → llena el tile sin desbordar.
  Top 6 familias + cola agregada en «Otras familias». Tamaño por defecto ensanchado a `w:5 h:2` (el handoff lo
  dibuja a `1.7fr`≈790px). La molécula `Treemap` de `@simpletpv/ui` queda solo para la galería/tests (revertido
  su `min-height`).
- **Doble borde**: moléculas con tarjeta propia (KpiDual/KpiStat-card/Leaderboard) en panel NO-`bare` →
  dos bordes. Marcados `bare`: `cmp-leaderboard`, `kpi-dual`, `kpi-area`, `kpi-alerta`, `kpi-7dias`.
- **`tabla-tareas`** → «Reposición de stock»: reestilizado como lista de ESTADO (píldoras Pendiente/
  Repuesto), NO checklist clicable — las alertas se resuelven solas en backend (`reevaluate_alert`), no
  hay endpoint para marcarlas a mano. Quitado `CheckIcon` + CSS huérfano; labels de catálogo alineados.

Verificado por captura propia (harness temporal, ya borrado) a tile alto/corto/ancho de cada arquetipo
y por captura del dashboard real. Gate verde en cada fase (typecheck + lint + 52 tests de paneles).

## Auditoría de límites de tamaño + doble borde (2026-06-29, ultracode)

Auditoría orquestada (workflow: 11 agentes por sección → verificación adversaria de bordes → síntesis
reconciliadora) de los 42 widgets en dos ejes.

- **Límites de tamaño** — `WIDGET_SIZE_BOUNDS` en `dashboard-layout.ts`: `{minW,maxW,minH,maxH}` en
  unidades de rejilla (12 col) por widget, coherentes por arquetipo (mini 2–4×1–2; tabla/feed 3–6×2–5;
  donut/gauge ~cuadrado 2–4/5×1–3; treemap/gráfica 4–8×2–4; banner/rejilla-KPI 6–12; etc.). Todos los
  `ITEM_SPECS` actuales caen dentro (test). Como los widgets **no** tienen tirador de resize y el
  compositor IA solo añade/coloca (sin op de resize), los límites se aplican como **barrera al cargar**:
  `clampWidgetPx`/`clampWidgetUnits` + clamp en `migrateFreeElement` (cualquier layout guardado/compuesto
  se acota; un tamaño ausente cae a `freeItemSize` antes de clampar). Efecto colateral: un `cmp-treemap`
  guardado a `w:3` (< nuevo `minW:4`) se autocorrige a `w:4` al cargar. Test de coherencia en
  `dashboard-layout.test.ts` (rangos válidos, ITEM_SPECS ∈ rango, clamp arriba/abajo, round-trip px).
- **Doble borde** — modelo: el wrapper del lienzo (`.dash-free-item`) NO tiene borde; el único borde lo
  pone el panel (`.dash-panel`, no-`bare`) **o** la tarjeta propia del widget (`bare`). Doble borde =
  panel no-`bare` con molécula/tarjeta interna que también dibuja borde, o tarjeta `bare` con un elemento
  interno enmarcado. 3 confirmados (verificación adversaria; rechazó falsos positivos como
  `graf-store-bars`) y corregidos: `cmp-ribbon` (panel + `.dv-kpigrid` bleed → `bare`),
  `esp-resumen-ejecutivo` (`.sp-card` + `.sp-exec-stats` → quitado borde de la tira, divisores por
  gap:1px), `lista-rankings` (`.lc-card` + `.rk-tabs` → quitado borde del segmentado, track sutil basta).
  Los 4 widgets no-`bare` restantes (`cmp-donut`, `cmp-hero`, `diag-actividad`) tienen molécula sin borde
  → un único borde (el del panel), correcto. Verificado por captura before/after.

## Área transparente + doble borde en widgets `fit="center"`/`natural` (2026-06-29)

Síntoma (reportado): algunos widgets muestran **fondo transparente en el lienzo** y son los MISMOS que
dan **doble borde en layout (grid)**. Diagnóstico (gauge de margen como ejemplo, verificado midiendo cajas
y con captura de ambos modos): un widget `bare` con `fit="center"` centra su tarjeta a TAMAÑO INTRÍNSECO
(`place-items:center`); como el panel `bare` es transparente, en el lienzo se ve el lienzo gris alrededor
de la tarjeta pequeña (= área transparente), y en grid el borde del tile (`.dash-grid-tile`, que ES la
superficie) + el borde de la tarjeta pequeña centrada = doble borde concéntrico. Mismo mecanismo en los
`bare` sin `fit` (→ `natural`, tarjeta a alto natural centrada → tiras transparentes).

Regla establecida: **un widget `bare` SIEMPRE debe ser `fit="stretch"`** (la tarjeta llena el tile = la
superficie opaca; el contenido se centra DENTRO de la tarjeta). `fit="center"` solo para NO-`bare`.
Corregidos: `mini-gauge` (+ `.mw-gauge {margin:auto}`), `mini-donut`, `kpi-classic` (+ `.kw-card
{justify-content:center}`), `estado-operativo`, `mini-heatmap` (+ `.mw-heat {flex:1; grid-auto-rows:1fr}`,
celdas altas), `lista-familia`, `lista-mix` (+ `.lc-card` flex-columna `height:100%` y `.fam-list`/
`.rk-list`/`.mix-legend` `flex:1; justify-content:space-between`). Verificado: los 7 widgets LLENAN el
tile en ambos modos (medición de cajas) con un único borde limpio; capturas before/after + hover. Dato
de arquitectura: `.dash-panel--bare` (quita borde/fondo/padding/radio) se define en `kpi-grid.css`, que
es global en la app (cualquier widget KPI lo importa).

---

## Fase 3 · Rediseños puntuales + conteo adaptativo de listas (2026-06-29)

A petición del usuario, cuatro mejoras tras la auditoría de tamaños y el arreglo de áreas
transparentes:

1. **«Top vendedores» (`cmp-leaderboard`) rehecho A MEDIDA.** La molécula genérica `Leaderboard`
   se rompía en tiles estrechos (a `w:3` caía a 1 columna de tarjetas con borde apiladas, desbordando).
   Reemplazada por una lista de ranking vertical propia (`.lb-*` en `compactos.tsx`/`compactos.css`):
   tarjeta `bare` que LLENA el tile, cabecera fija + filas compactas de 2 líneas
   (puesto·nombre·cifra / barra proporcional·tickets). Nº1 con chip azul; top-3 con barra en acento.

2. **`kpi-dual` (facturación/beneficio) desproporcionado → equilibrado.** La molécula `.dv-kpidual`
   no llenaba la tarjeta estirada: las 2 métricas quedaban arriba con un hueco enorme debajo. Fix en
   `dataviz.css`: `.dv-kpidual { height:100% }` + `.dv-kpidual-cell { flex:1; justify-content:center }`
   → las dos celdas reparten el alto a partes iguales con el filete divisor centrado.

3. **`mini-heatmap` horario en 2 filas.** `.mw-heat` pasa de 1 fila de 11 celdas altas a
   `grid-template-columns: repeat(6,1fr)` → las 11 horas SIEMPRE caen en 2 filas equilibradas (6+5),
   a cualquier ancho, rellenando el alto (panel `fit=stretch`).

4. **Conteo adaptativo de listas/rankings.** En vez de estirar/distribuir N filas fijas (disperso) o
   recortar a un nº constante, los widgets de lista ajustan el NÚMERO de filas a la altura del tile con
   el hook nuevo `useFitCount(rowHeight, {gap,min,max})` (`useFitCount.ts`): mide el contenedor con
   `ResizeObserver` y devuelve cuántas filas caben → `data.slice(0,count)`. Aplicado a `cmp-leaderboard`,
   `lista-familia`, `lista-rankings` y `diag-actividad` (más elementos en tiles altos, menos en bajos,
   sin filas a medias). El hook es defensivo en JSDOM (mide una vez si no hay `ResizeObserver`). Se
   retiró el `justify-content:space-between` de la Fase 2 en `.fam-list`/`.rk-list` (lo sustituye el
   conteo adaptativo con espaciado natural + `overflow:hidden`).

**Verificación:** typecheck (backoffice + ui) ✅, lint ✅, vitest 23 (paneles) + 11 (`KpiDual`) ✅.
Capturas por Playwright a varios tamaños: leaderboard h2→3 / h3→6 / h5→6 vendedores; lista-familia
h2→4 / h4→8 familias; lista-rankings h2→3 / h4→8 productos; diag-actividad h2→5 / h4→8 hitos; heatmap
w3h1 en 2 filas limpias; dual con celdas equilibradas. Pendiente: visto bueno del usuario antes de
commit (nada commiteado aún).
