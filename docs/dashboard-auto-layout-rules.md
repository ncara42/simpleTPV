# Reglas de auto-maquetación del dashboard (para el «Asistente de IA»)

> Objetivo: que el dashboard quede **lo más encajado y alineado posible**, cerrando huecos y
> bordes irregulares, **encajando los componentes entre ellos y estirándolos/encogiéndolos solo
> dentro de sus límites** (`WIDGET_SIZE_BOUNDS`), **sin deformarlos en exceso**.
>
> Resultado de una investigación de soluciones profesionales documentadas (ver §6 Fuentes).
> Estado: IMPLEMENTADO — motor `autoArrangeFree` (filas justificadas) en
> `apps/backoffice/src/lib/dashboard-layout.ts`, `reconcileFreeLayout` que respeta el tamaño dentro de
> límites, y reglas R1–R10 en el prompt del asistente (`crates/domain/src/chat/context.rs`, regla 5).

---

## 1. Diagnóstico (por qué hoy quedan huecos y bordes irregulares)

Mapa del sistema actual (verificado en código):

- El asistente **no fija coordenadas ni tamaños**. Solo emite `add_widget` con un `widgetId` de
  catálogo (o un `genericSpec`) y una **posición SEMÁNTICA** (`top-left … center`). Ops:
  `add_widget | add_shape | add_text | add_note | add_insight | remove_element | arrange | clear_canvas`
  (`apps/backoffice/src/lib/chat.ts`).
- **Modo libre (por defecto):** la posición semántica se traduce a 1 de 7 **anclas fijas** y, por
  cada elemento cercano, se **escalona 36 px en diagonal** (`freeSlot`, `dashboard-store.ts`); el
  widget se coloca **centrado** en ese punto. **No hay detección de colisión, ni alineación, ni
  compactación.** → De aquí salen los solapes, los bordes irregulares y los huecos.
- **`arrange` → `autoArrangeFree`** (`dashboard-layout.ts`): reflujo ingenuo en filas (orden por `z`,
  izq→der, salto de fila a 1200 px). **No justifica el ancho, no iguala alturas de fila, no compacta
  en vertical más allá de apilar filas.** Deja borde derecho irregular y filas de distinta altura.
- **Modo cuadrícula:** `grid-pack.ts` hace **skyline best-fit** sobre unidades gruesas (12 col):
  teselado sin huecos, sin redimensionar. Es el modo que YA queda limpio; el problema es el libre.
- **Tallas:** cada widget de catálogo tiene una talla fija en `ITEM_SPECS` y `reconcileFreeLayout`
  lo **re-fija a esa talla exacta** al cargar (en libre el usuario no redimensiona widgets). Existen
  límites por widget (`WIDGET_SIZE_BOUNDS`: ≈ ±4 col, −2/+5 filas) pero **hoy no se usan para estirar**.
- Rejilla de diseño: **48 columnas finas** (`BOARD_COLS`), celda `FREE_COL×FREE_ROW = 25×40 px`,
  **gutter `FREE_GAP = 16 px` ya descontado** de cada tile (`tile_px = u·25 − 16`). En unidades de
  columna, dos tiles contiguos `[x, x+w)` dejan el gutter de 16 px **automáticamente**.

**Conclusión:** un prompt no puede «encajar» píxeles porque el modelo no los controla. La solución
profesional es **un motor de empaquetado determinista** que se ejecuta al componer (op `arrange`), y
**reglas para el modelo** que le den al motor una entrada empaquetable. Las dos capas, abajo.

---

## 2. Qué hacen las herramientas profesionales (y qué tomamos de cada una)

| Herramienta / técnica                              | Mecanismo documentado                                                                                                                                 | Qué adoptamos                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Flickr `justified-layout`** (open source)        | Filas de tiles a **altura de fila objetivo**, **justificadas a todo el ancho**, respetando el aspect ratio nativo; «target row height» es la palanca. | Núcleo: **filas justificadas** + altura de fila uniforme.            |
| **react-grid-layout**                              | `compactType: 'vertical'` (flotan hacia ARRIBA cerrando huecos) / `'horizontal'` / `null`; colisiones + `moveElement`.                                | **Compactación vertical** (float-up) tras empaquetar.                |
| **gridstack.js**                                   | `float:false` (default: los widgets flotan a rellenar huecos) + `compact()` con `'compact'`/`'list'` para reclamar espacio.                           | Confirma float-up por defecto; `list` = conservar orden.             |
| **Grafana 12 «Auto grid layout»**                  | El motor coloca/dimensiona; parámetros: **ancho mín. de columna, máx. de columnas, altura de fila**.                                                  | Parámetros del motor: máx. columnas/fila y altura de fila.           |
| **Tableau (tiled + «Distribute Evenly»)**          | En _tiled_ los objetos **snap a rejilla y se redimensionan para rellenar**; comando «distribuir uniformemente».                                       | Snap a rejilla + **justificar/repartir** el sobrante.                |
| **Power BI**                                       | **Snap to grid** + alinear/distribuir; «grid system» para columnas alineadas.                                                                         | Snap a la rejilla fina + ritmo de columnas.                          |
| **Amazon QuickSight**                              | **Tiled** (snap, **sin solapes**, rellena el espacio) vs **Free-form** (píxel, puede solaparse → desordenado).                                        | Tratar la composición como _tiled_, no _free-form_.                  |
| **Bin packing 2D (Jylänki)**                       | Familias _shelf / skyline / MaxRects / guillotine_; _shelf_ empaqueta por estantes (filas) izq→der, abajo→arriba.                                     | Base teórica: **shelf/strip packing** por filas.                     |
| **CSS `grid-auto-flow: dense`**                    | Rellena huecos anteriores con items menores posteriores (puede alterar el orden).                                                                     | **Back-fill** opcional de huecos con widgets pequeños.               |
| **Squarified treemaps** (Bruls, Huizing, van Wijk) | Genera rectángulos **lo más cuadrados posible**; minimiza la desviación del aspect ratio.                                                             | Guardia anti-deformación: minimizar la distancia al aspecto natural. |
| **CSS flexbox `flex-grow`**                        | Reparte el espacio libre del eje principal entre los items.                                                                                           | Mecánica de «estirar para llenar la fila».                           |

**Síntesis:** todas convergen en lo mismo — **no posicionar a píxel; empaquetar en filas sobre una
rejilla compartida, justificar cada fila a todo el ancho, igualar la altura de la fila, compactar en
vertical, y estirar SOLO dentro de límites cuidando el aspect ratio.** Es la maquetación «justified
rows» (Flickr) + «vertical compaction» (RGL/gridstack) + «auto-grid» (Grafana) + «tiled/distribute»
(Tableau/QuickSight), acotada por nuestros `WIDGET_SIZE_BOUNDS` y la guía squarified.

---

## 3. Solución elegida: **compactación por filas justificadas** («justified rows»)

Trabaja en **unidades de columna fina** sobre una tira de **48 columnas** (el gutter de 16 px es
automático entre tiles contiguos). Se ejecuta de forma determinista al componer (op `arrange` y tras
cada turno multi-widget). Sustituye a `autoArrangeFree` y reutiliza la base ya probada de
`grid-pack.ts`.

### Parte A — Contrato del MOTOR (determinista; lo aplica `arrange`)

Entrada: lista ordenada de widgets (orden de emisión del modelo), cada uno con su talla natural
(`ITEM_SPECS`/`defaultSize`) y sus límites (`WIDGET_SIZE_BOUNDS`). Constantes: `BOARD_COLS = 48`,
`FREE_ROW = 40 px`, `ROW_GUTTER = 16 px`, `MAX_PER_ROW ≈ 4` (desktop).

```
A1. SNAP. Toda talla y posición se redondea a la rejilla fina (col enteras × fila entera).
    Nada de píxeles libres → bordes siempre sobre la misma malla (snap-to-grid).

A2. SHELF-PACK por filas, en el orden dado (shelf/strip packing):
    abre una fila; añade widgets a su ANCHO NATURAL mientras Σw ≤ 48 columnas.
    - Si el siguiente no cabe, cierra la fila.
    - Tope de legibilidad: máx. MAX_PER_ROW widgets por fila.
    - Un widget de ancho ≥ ~44 col (banda/banner) ocupa fila propia.

A3. JUSTIFICA la fila al ancho completo (Flickr justified / flex-grow / Tableau distribute):
    sobrante = 48 − Σw_natural.
    - sobrante > 0  → repartir creciendo los widgets hacia su maxW, proporcional a su ancho,
                      clamp a maxW. Si AÚN sobra (todos en maxW), repartir el resto como
                      ESPACIO igual entre tiles (gutters iguales) → sin borde derecho irregular.
    - sobrante < 0  → encoger hacia minW, proporcional; si sigue sin caber, el último widget
                      pasa a la fila siguiente.
    Regla de oro: una fila SIEMPRE llena las 48 columnas (estirando dentro de límites o,
    en su defecto, repartiendo el hueco como whitespace uniforme).

A4. IGUALA LA ALTURA DE FILA (estante plano → bordes superior/inferior alineados):
    rowH = altura representativa de la fila (p. ej. la mediana de las alturas naturales).
    Para cada widget: h ← clamp(rowH, minH, maxH).
    - Si su maxH < rowH (no llega): se queda en maxH y se CENTRA en la banda de la fila
      (no se deforma; se prefiere aire a estirar de más).
    Esto es lo que más elimina los «bordes irregulares».

A5. COMPACTA EN VERTICAL (float-up; RGL compactType:'vertical' / gridstack float:false):
    apila cada fila justo bajo la anterior + 1 gutter. Sin huecos verticales.

A6. BACK-FILL opcional (CSS dense / MaxRects / Muuri fillGaps):
    si una fila quedó con hueco que ningún miembro puede absorber sin pasarse de maxW,
    intenta traer de una fila posterior un widget PEQUEÑO que quepa en el hueco
    (solo si no rompe la afinidad de altura de la fila). Mejora el llenado a costa de
    alterar levemente el orden — igual que `grid-auto-flow: dense`.

A7. GUARDIA ANTI-DEFORMACIÓN (squarified):
    todo crecimiento/encogimiento queda DENTRO de [minW,maxW]×[minH,maxH]; entre repartos
    factibles, elige el que MINIMIZA Σ |aspecto_nuevo − aspecto_natural|. Nunca se deforma
    fuera de límites: antes se deja whitespace (A3) o aire vertical (A4).
```

Propiedades garantizadas: filas a todo el ancho (sin hueco a la derecha), tops/bottoms de fila
alineados (bordes regulares), sin huecos verticales, estiramiento solo dentro de límites y con
mínima distorsión de aspecto. Es determinista y estable (mismo input → mismo layout).

> Nota de implementación: hoy `reconcileFreeLayout` re-fija los widgets de catálogo a su talla exacta.
> Para permitir A3/A4 hay que **persistir la talla calculada por el motor** (dentro de bounds) y que
> `reconcile` respete una talla «arreglada» en lugar de pisarla. El skyline de `grid-pack.ts` es la
> base ideal para A2/A5 (ya tesela sin huecos); A3/A4 son la capa nueva de justificado.

### Parte B — Reglas que sigue el MODELO «Asistente de IA»

Estas reglas viven en el system prompt (`crates/domain/src/chat/context.rs`). El modelo no coloca
píxeles: **elige widgets, su ORDEN y una banda gruesa**, y deja que el motor (Parte A) encaje.

```
R1. COMPÓN PARA EL EMPAQUETADOR, NO A PÍXEL. Tú decides qué widgets, en qué ORDEN y en qué banda
    (arriba/centro/abajo). El motor hace snap, empaqueta, justifica, alinea y compacta.

R2. ORDEN = ORDEN DE LECTURA, lo más importante/grande primero. El empaquetador llena filas en
    tu orden de emisión (izq→der, arriba→abajo). Emite los `add_widget` en ese orden.

R3. ARMA FILAS QUE SUMEN EL ANCHO COMPLETO (48 col ≈ 12 gruesas). Combina anchos que completen
    una fila: 1 full · 2 medios (≈24) · 3 tercios (≈16) · 2/3 + 1/3 (≈32+16) · 4 cuartos (≈12).
    Evita dejar un widget suelto que ocupe ~70% de la fila con un hueco irregular: dale compañero
    o hazlo de ancho completo.

R4. AGRUPA POR ALTURA (afinidad de altura). Pon en la misma fila widgets de altura natural
    parecida (listas altas con listas altas; KPIs bajos con KPIs bajos). NUNCA mezcles un widget
    muy bajo con uno muy alto en la misma fila (la igualación de altura estiraría el bajo o
    dejaría hueco).

R5. LOS DE ANCHO COMPLETO VAN SOLOS en su fila (banda de KPIs, banner ejecutivo): su propia banda.

R6. TOPE POR FILA ≈ 4 widgets (desktop). No metas tantos que alguno baje de su ancho mínimo
    (ilegible).

R7. CIERRA SIEMPRE CON `arrange`. Tras añadir/quitar widgets (o en cualquier turno multi-widget),
    emite `arrange` como ÚLTIMA op para que el motor encaje, alinee y compacte. No dejes nunca
    widgets recién soltados como estado final.

R8. `position` ES SOLO UNA PISTA DE BANDA (arriba/centro/abajo), no colocación fina. La geometría
    la decide el empaquetador.

R9. WIDGETS GENÉRICOS: tallas MODULARES. Fija `defaultSize.w` a una fracción del tablero
    (48/24/16/12) y la altura en la misma banda que sus compañeros de fila, dentro de sus límites.

R10. NO DEFORMES: CONFÍA EN LOS LÍMITES. No fuerces tallas lejos de lo natural; el motor estira/
    encoge solo dentro de los límites de cada widget y conserva su proporción.
```

---

## 4. Dónde se conecta y qué implica implementar

1. **Prompt del asistente** — `crates/domain/src/chat/context.rs` (sección «Comportamiento esperado»,
   l. 175-294): incorporar R1–R10 (refuerza la actual «Regla 5: usa `arrange`» → «cierra SIEMPRE
   con `arrange`»).
2. **Motor `arrange`** — sustituir `autoArrangeFree` (`apps/backoffice/src/lib/dashboard-layout.ts`)
   por la compactación por filas justificadas (Parte A), reutilizando el skyline de
   `apps/backoffice/src/lib/grid-pack.ts` para A2/A5 y añadiendo el justificado A3/A4.
3. **Persistencia de talla** — permitir que un widget de catálogo guarde la talla calculada por el
   motor (dentro de `WIDGET_SIZE_BOUNDS`) y que `reconcileFreeLayout` la respete en vez de re-fijar
   `ITEM_SPECS` (hoy bloquea el estiramiento).
4. **Aplicar al componer** — que cada turno multi-widget termine ejecutando el motor (no solo cuando
   el usuario pide ordenar), de modo que el resultado del asistente nazca ya encajado.
5. (Opcional) Unificar: el modo cuadrícula ya empaqueta bien; el libre adopta el mismo motor para que
   ambos queden «tiled».

Límite honesto (lo que pedía el usuario): **ninguna regla hace que TODA configuración encaje perfecta**
(es imposible con tallas heterogéneas); estas reglas **se acercan al máximo** — filas llenas, bordes
alineados, sin huecos verticales — **sin deformar** (todo dentro de límites, con guardia de aspecto).

---

## 5. Parámetros recomendados (afinables)

- `BOARD_COLS = 48` (fija) · gutter `16 px` (fijo) · `MAX_PER_ROW = 4` (desktop), `2` (tablet), `1` (móvil).
- Anchos canónicos sugeridos al modelo: **48 / 32 / 24 / 16 / 12** col (full, 2/3, 1/2, 1/3, 1/4).
- Altura de fila = mediana de alturas naturales de la fila, **clamp** por widget a `[minH, maxH]`.
- Tolerancia de estiramiento = `WIDGET_SIZE_BOUNDS` (≈ ±4 col, −2/+5 filas). No ampliar sin medir.

---

## 6. Fuentes (documentación profesional)

- Flickr — [Justified Layout (demo)](https://flickr.github.io/justified-layout/) · [repo](https://github.com/flickr/justified-layout) · [«Our Justified Layout Goes Open Source»](https://code.flickr.net/2016/04/05/our-justified-layout-goes-open-source/)
- react-grid-layout — [README / compactType y compactores](https://github.com/react-grid-layout/react-grid-layout/blob/master/README.md)
- gridstack.js — [API: `float()` y `compact()`](https://github.com/gridstack/gridstack.js/blob/master/doc/API.md)
- Grafana 12 — [Dynamic dashboards / Auto grid layout](https://grafana.com/blog/dynamic-dashboards-grafana-12/) · [Build dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/)
- Tableau — [Size and Lay Out Your Dashboard (floating/tiled)](https://help.tableau.com/current/pro/desktop/en-us/dashboards_organize_floatingandtiled.htm) · [Refine Your Dashboard (Distribute Evenly)](https://help.tableau.com/current/pro/desktop/en-us/dashboards_refine.htm)
- Power BI — [Use Gridlines and Snap-to-Grid](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-gridlines-snap-to-grid) · [Grid system applied to report design](https://bibb.pro/post/grid-system-applied-to-report-design-in-power-bi/)
- Amazon QuickSight — [Types of layout (Tiled vs Free-form)](https://docs.aws.amazon.com/quicksight/latest/user/types-of-layout.html) · [Pixel-perfect free-form layout](https://aws.amazon.com/blogs/big-data/create-stunning-pixel-perfect-dashboards-with-the-new-free-form-layout-mode-in-amazon-quicksight/)
- MDN — [`grid-auto-flow` (incl. `dense`)](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-auto-flow)
- Bin packing 2D — Jukka Jylänki, «A Thousand Ways to Pack the Bin» (resumen vía [Wolfram RectanglePacking](https://resources.wolframcloud.com/PacletRepository/resources/JasonB/RectanglePacking/)) · [Skyline heuristic (Julien Vernay)](https://jvernay.fr/en/blog/skyline-2d-packer/implementation/)
- Squarified Treemaps — Bruls, Huizing, van Wijk (2000), [PDF](https://vanwijk.win.tue.nl/stm.pdf) · [EG digital library](https://diglib.eg.org/handle/10.2312/VisSym.VisSym00.033-042)
- CSS — flexbox `flex-grow` (MDN, reparto del espacio libre del eje principal)
