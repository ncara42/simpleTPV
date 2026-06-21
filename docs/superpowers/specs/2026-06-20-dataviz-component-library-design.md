# Librería granular de dataviz + DSL de paneles por recetas y bloques (diseño garantizado por construcción)

> Spec de diseño (EPIC propuesto) generado por pase multi-agente el 2026-06-20. Pendiente de aprobación del usuario antes de implementar.

## Filosofía y diagnóstico

DIAGNÓSTICO (confirmado leyendo el código): la arquitectura ya es la correcta (DSL declarativo validado en `normalizeGenericSpec` + allowlist de endpoints + render por registry + tool `add_widget`). El whack-a-mole NO nace de la arquitectura sino de que `CompositeNode` (dashboard-layout.ts L201-210) expone al agente EJES CONTINUOS Y CRUDOS: `leaf.spec.type ∈ {bar,line,...}` (primitiva sin diseño), `span` numérico, `gap` en px, `default_size` w/h libres, `dir` arbitrario, profundidad 3. Cada número libre es una oportunidad de feo que `COMPOSITE_GUIDE` (~55 líneas de reglas de diseño en prosa, context.rs L151-207) intenta tapar sin éxito.

PRINCIPIO RECTOR (decidido, no opcional): el agente ELIGE ENTRE VARIANTES (enums con default horneado), NO PARAMETRIZA GEOMETRÍA (números). Granularidad ALTA en el VOCABULARIO (átomos y moléculas muy granulares, cada uno bonito por construcción sobre tokens --ui-\*) y granularidad BAJA en los GRADOS DE LIBERTAD de cómo se combinan (recetas con slots tipados, no árbol libre). Esto satisface la insistencia del usuario en "muy granular" sin abrir la puerta al desorden.

TRES NIVELES que el agente referencia, de menos a más esfuerzo: (1) BLOQUE pre-cableado (`block:<id>`) = un panel entero probado con UNA tool-call y cero árbol — el mayor reductor de whack-a-mole; (2) PANEL por RECETA (`kind:'panel'`, `recipe` enum + `slots` tipados) cuando quiere algo a medida pero seguro; (3) el `composite` v1 (type+stack) QUEDA SOLO como motor interno de render y ruta de hidratación de layouts persistidos — se RETIRA de la superficie del agente. No se tira nada: convivencia no destructiva con precedente real (`migrateLayoutPref`/`migrateFreeElement`).

DOS REFUERZOS decididos: (a) la validación REPARA además de podar — clampa enums al valor válido más cercano, auto-elige gráfica por shape del dato, hornea defaults si el agente omite todo → menos respuestas vacías que el `normalizeGenericSpec` actual, que solo poda y devuelve null; (b) cada reparación se devuelve en `CanvasResult.reason` (ya existe el canal, store L55-63 → `reportCanvasResult`) para que el LLM sepa qué se ajustó (ej. "degradé el donut a barras: 9 categorías") y no crea que puso un donut.

Restricciones del proyecto respetadas literalmente: nada de Tremor/shadcn (se replica solo su ESTRUCTURA sobre @simpletpv/ui); tokens --ui-_ (ya existen --ui-cat-1..8, --ui-success, --ui-danger, --ui-radius-_, verificados en theme.css); separación data↔UI intacta (endpoint+fields+params → useGenericData por hoja, RLS por debajo); allowlist WIDGETABLE_ENDPOINTS como segunda capa de defensa.

## Inventario de componentes

### ATOMS

- **StatValue** — Número grande formateado con Intl es-ES (eur/percent/decimal/units/integer) y escala tipográfica fija. Núcleo de todo KPI.
  - props: `value:number|null; format:'eur'|'percent'|'decimal'|'units'|'integer'; size?:'sm'|'md'|'lg'`
  - sobre: tokens --ui-text + Intl.NumberFormat('es-ES')
- **StatLabel** — Rótulo de métrica en --ui-text-muted, peso/tamaño fijos. Nunca font-size suelto.
  - props: `children:ReactNode`
  - sobre: tokens --ui-text-muted
- **DeltaBadge** — Variación +/- con flecha y color semántico por signo (success/danger/neutral). Equivale a BadgeDelta de Tremor.
  - props: `delta:number|null; format?:'percent'|'eur'; invert?:boolean (para métricas donde bajar es bueno: descuento/devolución)`
  - sobre: tokens --ui-success/--ui-danger/--ui-text-muted
- **TrendCaption** — Texto secundario bajo el valor ('+12% vs ayer'), tono por signo.
  - props: `text:string; tone?:'up'|'down'|'neutral'`
  - sobre: tokens --ui-text-muted/--ui-success/--ui-danger
- **MiniSparkline** — Sparkline con alto y markup fijos para incrustar dentro de un KpiTile.
  - props: `data:number[]; tone?:'accent'|'success'|'danger'`
  - sobre: Sparkline de @simpletpv/ui
- **ChartLegend** — Leyenda de series con punto de color del token categórico + etiqueta. Compartida por charts.
  - props: `items:{label:string;colorVar:string}[]`
  - sobre: tokens --ui-cat-1..8
- **SectionHeader** — Título de panel/sección con jerarquía fija. Sustituye los figcaption sueltos y el dash-generic-title actual.
  - props: `title:string; subtitle?:string`
  - sobre: tokens --ui-text/--ui-text-muted
- **StatusPill** — Indicador de estado (agotado/bajo/ok/caduca) con color semántico.
  - props: `label:string; tone:'ok'|'warn'|'danger'`
  - sobre: tokens --ui-success/--ui-danger + amber (--ui-cat-3)
- **WidgetStates** — Estados loading/error/empty horneados y COMPARTIDOS (hoy duplicados ad-hoc en cada Generic\*: ChartFallback, '—', emptyState). Primera clase.
  - props: `state:'loading'|'error'|'empty'; message?:string`
  - sobre: tokens --ui-surface-subtle/--ui-text-muted

### MOLECULES

- **KpiTile** — Pieza KPI canónica: StatLabel + StatValue + DeltaBadge + MiniSparkline opcional. Sustituye el markup crudo de GenericKpi.
  - props: `piece:'kpiTile'; title; endpoint; valueField; format; deltaField?; sparkField?; size?; params?`
  - sobre: StatLabel+StatValue+DeltaBadge+MiniSparkline+WidgetStates; datos vía useGenericData
- **ComparisonBars** — Barras de comparación entre categorías con cap de nº de barras (8) y orden por valor HORNEADOS. Para vendedores/familias/tiendas.
  - props: `piece:'comparisonBars'; title; endpoint; labelField; valueField; format; maxBars?(≤12 clamp); params?`
  - sobre: Chart (kind=bar) de @simpletpv/ui + WidgetStates
- **TrendLine** — Línea temporal con eje temporal horneado. Para series por hora/día.
  - props: `piece:'trendLine'; title; endpoint; labelField; valueField; format; params?`
  - sobre: Chart (kind=line) + WidgetStates
- **TrendArea** — Área temporal (variante de relleno de TrendLine). Para volumen/ingresos por tiempo.
  - props: `piece:'trendArea'; title; endpoint; labelField; valueField; format; params?`
  - sobre: Chart (kind=area) + WidgetStates
- **ShareDonut** — Donut de reparto con GUARDIA horneada '≤6 categorías o degrada a RankBarList'. La degradación vive en la pieza, no en el prompt.
  - props: `piece:'shareDonut'; title; endpoint; labelField; valueField; format; params?`
  - sobre: PieChart (donut) + RankBarList (fallback) + WidgetStates
- **RankBarList** — Ranking horizontal con barra de fondo proporcional + valor a la derecha. NUEVA (no existe en @simpletpv/ui). Equivale a BarList de Tremor. Top productos/vendedores.
  - props: `piece:'rankBarList'; title; endpoint; labelField; valueField; format; maxRows?(≤10 clamp); params?`
  - sobre: DESDE CERO sobre tokens --ui-cat-1/--ui-surface-subtle/--ui-radius-md + WidgetStates
- **SegmentBar** — Barra única segmentada de reparto. NUEVA. Equivale a CategoryBar de Tremor. Alternativa compacta al donut.
  - props: `piece:'segmentBar'; title; endpoint; labelField; valueField; params?`
  - sobre: DESDE CERO sobre tokens --ui-cat-1..8 + ChartLegend + WidgetStates
- **ProgressMeter** — Barra de progreso hacia un objetivo (cumplimiento de meta). NUEVA. Equivale a ProgressBar de Tremor.
  - props: `piece:'progressMeter'; title; endpoint; valueField; targetField?|target?; format; params?`
  - sobre: DESDE CERO sobre tokens --ui-cat-1/--ui-success + WidgetStates
- **DataGrid** — Tabla con cabeceras legibles, alineación por tipo (texto izq / número der), formato y zebra horneados. Arregla el 'header = nombre crudo del campo' actual de GenericTable.
  - props: `piece:'dataGrid'; title; endpoint; columns:{field;label;format?;align?}[]; maxRows?; params?`
  - sobre: DataTable de @simpletpv/ui + WidgetStates
- **StockAlertList** — Lista de roturas/caducidad con StatusPill + cantidad + umbral. Cableada a /stock/alerts y /stock/expiring.
  - props: `piece:'stockAlertList'; title; endpoint('/stock/alerts'|'/stock/expiring'); maxRows?; params?`
  - sobre: StatusPill + WidgetStates
- **InsightCard** — Markdown saneado del agente. Ya existe como GenericInsight; encaja como molécula (no se cablea a endpoint).
  - props: `piece:'insight'; title?; markdown:string`
  - sobre: GenericInsight existente (sanitizado)

### LAYOUTS

- **PanelShell** — Contenedor de panel: SectionHeader opcional + región de slots. Una sola tarjeta a medida. Reemplaza el .generic-composite wrapper.
  - props: `title?; density:'compact'|'comfortable'; children`
  - sobre: tokens --ui-surface/--ui-border/--ui-radius-lg
- **KpiRow** — Fila de 2-4 KpiTile con gutter y wrap responsive horneados. Deriva columnas del enum `columns`, NO de span.
  - props: `columns:1|2|3|4; children:KpiTile[]`
  - sobre: CSS grid-template derivado de enum + tokens de espaciado
- **ChartGrid** — Rejilla de 1-2 charts por fila con alturas horneadas. Deriva grid-template del enum, no de span/gap.
  - props: `columns:1|2; emphasis?:'hero'|'normal'; children:chartPieces[]`
  - sobre: CSS grid-template derivado de enum
- **GenericPanel** — Render de un PanelSpecV2: monta PanelShell + la receta (KpiRow/ChartGrid) y rellena cada slot despachando por `piece` a su molécula. Reemplaza GenericComposite en la ruta v2.
  - props: `spec:PanelSpecV2`
  - sobre: PanelShell + KpiRow + ChartGrid + moléculas; useGenericData por hoja

### BLOCKS

- **SalesOverviewBlock** — Panel cableado: KpiRow (revenue/avgTicket/upt de /dashboard/sales-kpis) + TrendArea por hora (/dashboard/sales-by-hour). Colocable con block:sales-overview.
  - props: `params?:{period;storeId}`
  - sobre: GenericPanel con receta y slots fijos
- **StockRiskBlock** — StockAlertList (/stock/alerts) + lista de caducidad (/stock/expiring) + KPI venta perdida (/dashboard/stockout-kpis).
  - props: `params?:{storeId}`
  - sobre: GenericPanel con slots fijos
- **StaffPerformanceBlock** — RankBarList de ventas por vendedor (/dashboard/sales-by-employee) + ComparisonBars de descuento por empleado (/dashboard/discount-by-employee).
  - props: `params?:{period;storeId}`
  - sobre: GenericPanel con slots fijos
- **ProductRankingBlock** — RankBarList configurable por rankBy (sales/margin/rotation) sobre /dashboard/product-rankings.
  - props: `params?:{period;rankBy;storeId}`
  - sobre: GenericPanel con slot fijo

## DSL del agente

DOS superficies nuevas para el agente, sobre el `GenericSpec` actual; el `composite` v1 se conserva pero deja de ofrecerse.

A) BLOQUE (máximo nivel, cero árbol). El agente coloca un panel entero registrado en catálogo:
{ "op":"add_widget", "widget_id":"block:sales-overview", "element_id":"<uuid>", "position":"top-left",
"params": { "period":"month" } }
— Igual de simple que colocar un widget fijo del catálogo. `params` se hereda por todas las hojas del bloque.

B) PANEL POR RECETA (a medida, seguro). `kind:'panel'`, `recipe` de un enum cerrado, `slots` tipados:
{ "op":"add_widget", "widget_id":"gen:panel", "element_id":"<uuid>", "position":"top-left",
"generic_spec": {
"version": 2,
"kind": "panel",
"title": "Rendimiento de ventas — este mes",
"recipe": "kpiRow+twoCharts",
"density": "comfortable",
"slots": {
"kpis": [
{ "piece":"kpiTile", "title":"Facturación", "endpoint":"/dashboard/sales-kpis", "valueField":"revenue", "format":"eur", "params":{"period":"month"} },
{ "piece":"kpiTile", "title":"Ticket medio", "endpoint":"/dashboard/sales-kpis", "valueField":"avgTicket", "format":"eur", "params":{"period":"month"} },
{ "piece":"kpiTile", "title":"Uds. por ticket", "endpoint":"/dashboard/sales-kpis", "valueField":"upt", "format":"decimal", "params":{"period":"month"} }
],
"charts": [
{ "piece":"trendArea", "title":"Ventas por hora", "endpoint":"/dashboard/sales-by-hour", "labelField":"hour", "valueField":"revenue", "params":{"period":"month"} },
{ "piece":"rankBarList", "title":"Top vendedores", "endpoint":"/dashboard/sales-by-employee", "labelField":"userName", "valueField":"total", "format":"eur", "params":{"period":"month"} }
]
}
} }

DIFERENCIAS CLAVE frente al composite v1 (dashboard-layout.ts L201-210):

- NO hay `root`, `kind:'stack'/'leaf'`, `dir`, `span`, `gap`, `default_size`. El agente nunca emite px ni spans ni profundidad.
- `recipe` es un ENUM CERRADO (RECIPE_ALLOWLIST): 'kpiRow', 'kpiRow+oneChart', 'kpiRow+twoCharts', 'heroChart+sideStats', 'tableFull'. La receta dicta el ancho/alto/gutter vía CSS grid-template, no el agente.
- Cada slot está TIPADO: `kpis[]` solo admite `piece:'kpiTile'`; `charts[]` admite el set chart/list/table (comparisonBars, trendLine, trendArea, shareDonut, rankBarList, segmentBar, progressMeter, dataGrid, stockAlertList). Una pieza en el slot equivocado se mueve/descarta esa pieza, no el panel.
- Cada hoja referencia `piece` (molécula con diseño horneado), no `type:'bar'` (primitiva cruda).
- `size`/`density`/`columns`/`maxRows`/`maxBars` son ENUMS o enteros clampados. `default_size` desaparece de la superficie: lo deriva la receta (un mapa RECIPE_SIZE).
- El cap de filas/barras, el orden por valor, el formato es-ES y la degradación donut→barras NO viajan en el DSL: viven dentro de la pieza.
- Separación data↔UI intacta: `endpoint`+`valueField`/`labelField`+`params` → cada pieza resuelve datos con useGenericData SIN cambios.

EVOLUCIÓN del composite actual: el `type:'composite'` con `root` sigue en `GenericSpec` (no se borra el tipo). `normalizeGenericSpec` gana una rama v2 que detecta `kind:'panel'` o `version:2`. El render despacha `kind:'panel'`→GenericPanel; `type:'composite'`→GenericComposite (motor interno) solo para layouts ya persistidos en `LayoutPref.genericWidgets`. En la fase final el prompt y el JSON-Schema dejan de OFRECER composite, pero la hidratación lo sigue aceptando.

## Validación (repara, no solo poda)

El cambio de fondo respecto al `normalizeGenericSpec` actual (dashboard-store.ts L332-357, que SOLO PODA y devuelve null → respuestas vacías): pasar a REPARAR. Nueva rama v2 `if (raw.kind === 'panel' || raw.version === 2)` ANTES de la rama composite:

1. `recipe` se valida contra RECIPE_ALLOWLIST; si no coincide, se clampa a la receta válida más cercana por nº de slots presentes (no se descarta). `density`/`columns` enums → clamp al valor válido.
2. Cada hoja-pieza se valida contra PIECE_ALLOWLIST (capa nueva ENCIMA de la allowlist de endpoints WIDGETABLE_ENDPOINTS, L197-211, que se mantiene tal cual). El `endpoint` de cada pieza sigue podándose si está fuera de la allowlist — ese es el ÚNICO motivo de poda dura (defensa RLS/input no confiable).
3. SLOT TIPADO: `SLOT_PIECES` mapea slot→piezas admitidas (kpis→[kpiTile]; charts→[comparisonBars,trendLine,trendArea,shareDonut,rankBarList,segmentBar,progressMeter,dataGrid,stockAlertList]). Una pieza en el slot equivocado se REUBICA si encaja en otro slot; si no, se descarta solo esa pieza, nunca el panel.
4. REPARACIÓN de enums: clampEnum(size/columns/maxRows/maxBars) al rango válido (maxRows>10→10, etc.).
5. INFERENCIA de format ausente: FIELD_FORMATS mapea por nombre de campo (revenue/total/avgTicket→eur; *Rate/*Pct/marginPct→percent; upt→decimal; units/count→units) → el agente puede omitir `format` y aún sale bien.
6. DEGRADACIÓN por shape (shareDonut→rankBarList si >6 categorías): se decide EN RENDER dentro de la pieza (los datos no están en validación; useGenericData es por hoja). La validación deja la intención; la pieza ejecuta la guardia y la pieza informa.
7. DEFAULTS horneados: si faltan recipe/slots se cae a un panel mínimo (kpiRow con las piezas válidas) o, si no hay ninguna hoja válida, a un InsightCard con el título — NUNCA panel vacío por omisión, solo por endpoint fuera de allowlist.
8. Límite de hojas: reusar MAX_COMPOSITE_LEAVES como cota total; exceso TRUNCADO (no rechazo).
9. FEEDBACK: cada ajuste (clamp, reubicación, inferencia, truncado, degradación prevista) se acumula en `CanvasResult.reason` para que el LLM lo sepa vía reportCanvasResult.

`validateCompositeNode`/`pruneLeaves`/`normalizeLeafSpec`/MAX_COMPOSITE_DEPTH (L237-327) se CONSERVAN intactos como ruta v1 para hidratar `type:'composite'` ya persistido. La validación dura del árbol/slots vive en el FRONTEND (el árbol viaja como valor; `camel_case_keys` del backend solo toca nivel superior — gotcha ya documentado en el código).

## Integración

VALIDACIÓN — apps/backoffice/src/lib/dashboard-store.ts: `normalizeGenericSpec` gana la rama v2 descrita; importa allowlists/mapas de un nuevo `dashboard-pieces.ts`. `placeGeneric` (L172-186) NO cambia: sigue escribiendo SIEMPRE en `freeLayouts` (el preset 'personalizado' deriva su lista de widgets de freeLayouts en ambos modos; escribir solo en grid dejaba el widget sin renderizar — gotcha ya documentado en el código). El id determinista `genericElementId` (L166-168) y el undo por id se mantienen: los bloques y paneles v2 usan el MISMO `gen:`/`block:`-prefijo→element_id.

TIPOS — apps/backoffice/src/lib/dashboard-layout.ts: añadir `PieceId`, `RecipeId`, `SlotName`, `PieceSpec` (hoja con `piece`+bindings+enums), `PanelSpecV2` (`kind:'panel'`, recipe, density, slots). Extender `GenericSpec` con campos opcionales v2 (`version?`, `kind?`, `recipe?`, `slots?`) MANTENIENDO `root?`/`type` por compat. RECIPE_SIZE: Record<RecipeId,{w,h}> sustituye el uso de `default_size` del agente. GENERIC_DEFAULT_SIZE se mantiene para v1.

RENDER — apps/backoffice/src/widgets/generic/: `GenericWidget.tsx` (despachador, L14-34) gana `case 'panel': return <GenericPanel spec={spec} />` ANTES del `case 'composite'`. Nuevo `GenericPanel.tsx` (layout): monta PanelShell + la receta (KpiRow/ChartGrid) y rellena slots despachando cada hoja por `piece` a su molécula. Los Generic\* actuales (GenericKpi/GenericChart/GenericTable/GenericInsight) se REFACTORIZAN para delegar en las moléculas (KpiTile/ComparisonBars/DataGrid/InsightCard) → mismo render y mismos estados (WidgetStates) para v1 y v2. `GenericComposite.tsx` queda como motor interno de `type:'composite'` (hidratación). useGenericData SIN cambios (fetch por hoja en paralelo).

LIBRERÍA — packages/ui/src/components/dataviz/ (NUEVA carpeta): átomos + moléculas reutilizables sobre tokens --ui-\* (verificados en theme.css: --ui-cat-1..8, --ui-success/-soft, --ui-danger/-soft, --ui-radius-md/lg, --ui-text/-muted, --ui-surface/-subtle/-border). NUEVAS desde cero: RankBarList, SegmentBar, ProgressMeter. El resto envuelve Chart/PieChart/Sparkline/DataTable. CSS en `dataviz.css` con grid-template derivado de los enums de receta/columns (el agente nunca emite px).

REGISTRY — apps/backoffice/src/widgets/registry.ts: los BLOQUES se registran como widgets de catálogo `block:<id>` con `defaultSize`+`label`, junto a los 22 fijos (sembrados en WIDGET_REGISTRY L65-75). `buildGenericWidgetSpec` (L88-97) gana rama para `kind:'panel'` (render GenericPanel) además de v1. `getWidgetLabel` etiqueta block:/gen: en snapshot y paleta (ya lo hace para gen:). El bloque se coloca con `add_widget widget_id='block:<id>'` sin construir slots.

BACKEND — crates/ai/src/tools.rs (add_widget, L40-59): ENDURECER el JSON-Schema en la capa de presentación. `generic_spec` gana propiedades v2: `kind` enum ['panel']; `recipe` enum cerrado; `density` enum; `slots` object con `kpis`/`charts` arrays cuyos items tienen `piece` enum, `endpoint` enum (= allowlist), `format` enum, `columns`/`maxRows` integer-con-rango. Constrained decoding del function-calling impide geometría/piezas inválidas mejor que la prosa. Añadir `block_id` enum para colocar bloques. `root`/`type:'composite'` se MARCAN deprecated en la descripción y, en la fase final, se retiran del schema visible (la hidratación frontend los sigue aceptando). `required` baja a `['kind']` o `['block_id']` según rama.

PROMPT — crates/domain/src/chat/context.rs: `WIDGET_CATALOG` (L31-58) suma los `block:<id>` con su propósito y reemplaza `gen:composite` por `gen:panel`. `COMPOSITE_GUIDE` (~55 líneas de reglas de DISEÑO en prosa, L151-207) se REESCRIBE como CATÁLOGO de PIEZAS + RECETAS + BLOQUES: cada entrada con id, propósito, campos que admite, en qué slot encaja y cuándo usarla — SIN reglas de 'cómo maquetar' (alto, cap de barras, donut≤6, formato) porque YA están horneadas en las piezas. `WIDGETABLE_ENDPOINTS` (L64-130) se mantiene como segunda capa de defensa y fuente de campos. Los tests existentes (L404-528) se actualizan: assert del catálogo de piezas/bloques, ausencia de POST/DELETE, paridad con la allowlist TS.

## Plan por fases

### F1 — F1 — Átomos + moléculas en packages/ui/src/components/dataviz/

Crear sobre tokens --ui-\* (verificados en theme.css): StatValue, StatLabel, DeltaBadge, TrendCaption, MiniSparkline, ChartLegend, SectionHeader, StatusPill, WidgetStates; moléculas KpiTile, ComparisonBars, TrendLine, TrendArea, ShareDonut, DataGrid, StockAlertList, InsightCard envolviendo Chart/PieChart/Sparkline/DataTable; y NUEVAS desde cero RankBarList, SegmentBar, ProgressMeter. dataviz.css con grid derivado de enums. Sin tocar DSL ni backend. VERIFICABLE: tests visuales Playwright a 320/768/1024/1440 por pieza + unit de formato es-ES (eur/percent/decimal/units). Entregable independiente: la librería existe y se ve bien aislada.

### F2 — F2 — Refactor de los Generic\* a las moléculas (compat total)

GenericKpi→KpiTile, GenericChart→ComparisonBars/TrendLine/TrendArea/ShareDonut, GenericTable→DataGrid, GenericInsight→InsightCard; estados unificados en WidgetStates (eliminar ChartFallback y '—'/emptyState ad-hoc). SIN cambiar el DSL: el contrato del agente (type+root) es idéntico. VERIFICABLE: GenericComposite.test.tsx y generic-widgets.test.tsx siguen verdes; los layouts composite persistidos renderizan. SALIDA: el diseño YA mejora sin tocar el agente.

### F3 — F3 — DSL v2: piezas + recetas + reparación en el store

dashboard-pieces.ts (fuente única: PIECE_ALLOWLIST, RECIPE_ALLOWLIST, SLOT_PIECES, FIELD_FORMATS, RECIPE_SIZE). dashboard-layout.ts: PieceId/RecipeId/SlotName/PieceSpec/PanelSpecV2 + GenericSpec extendido. dashboard-store.ts: rama v2 en normalizeGenericSpec que REPARA (clampEnum, infer format, mover/descartar pieza por slot, truncar hojas, fallback a InsightCard) y enriquece CanvasResult.reason. GenericPanel.tsx + KpiRow/ChartGrid/PanelShell; GenericWidget despacha kind:'panel'. v1 intacto como compat. VERIFICABLE: tests de normalización (reparación clampa y NO descarta; format inferido; slot equivocado reubicado; reason refleja ajustes) + E2E: el agente emite un panel v2 y se renderiza.

### F4 — F4 — Bloques cableados + registro block:<id>

SalesOverviewBlock, StockRiskBlock, StaffPerformanceBlock, ProductRankingBlock montados sobre GenericPanel con receta y slots fijos. Registrarlos en registry.ts como block:<id> con defaultSize+label; buildGenericWidgetSpec reconstruye en hydrate. applyCanvasOp enruta block: igual que gen:. VERIFICABLE: E2E — el agente coloca un bloque entero con add_widget widget_id='block:sales-overview' y aparece bien diseñado; undo lo elimina por el mismo id.

### F5 — F5 — Backend: endurecer schema + reescribir prompt

tools.rs: add_widget gana kind/recipe/density/piece/format/columns/maxRows como enums y block_id enum (constrained decoding); root/composite marcados deprecated. context.rs: COMPOSITE_GUIDE → catálogo de piezas+recetas+bloques (sin reglas de diseño en prosa); WIDGET_CATALOG suma block:<id> y cambia gen:composite→gen:panel. Tests Rust actualizados (catálogo presente, sin POST/DELETE) + test de PARIDAD allowlist TS↔Rust. VERIFICABLE: cargo test verde; medir tokens del prompt (no debe dispararse con los enums).

### F6 — F6 — Retirar composite v1 de la superficie del agente y medir

Quitar root/type:'composite' del JSON-Schema visible y del prompt (la hidratación frontend lo sigue aceptando para layouts persistidos). Borrar del prompt las reglas de diseño residuales (ya horneadas). VERIFICABLE: el agente solo emite block:/gen:panel; métrica de reducción de respuestas vacías y de iteraciones de tool-calling antes/después; whack-a-mole residual revisado en sesiones reales.

## Riesgos

- Coste inicial alto: ~9 átomos + ~11 moléculas (3 nuevas desde cero: RankBarList, SegmentBar, ProgressMeter) + recetas + 4 bloques + dos rutas de validación/render. F1-F2 ya dan valor; el grande llega en F4-F5. Mitigación: F2 mejora el diseño sin tocar el agente, así que hay entregable temprano.
- Doble vocabulario durante la ventana de compat (v1 type+root y v2 piece+recipe): más superficie de validación y tests. Mitigación: F6 retira v1 de la SUPERFICIE del agente; el código v1 solo sobrevive como hidratación, no como camino activo.
- Sincronización front↔backend: PIECE_ALLOWLIST + RECIPE_ALLOWLIST + WIDGETABLE_ENDPOINTS deben coincidir entre TS y Rust. YA hay drift latente entre las dos copias de WIDGETABLE_ENDPOINTS. Mitigación decidida: fuente única en dashboard-pieces.ts (lado TS) + test de paridad snapshot que falla si divergen de la lista Rust.
- La degradación shareDonut→rankBarList ocurre en RENDER (con datos), no en validación: dos paneles con el mismo spec pueden verse distinto según el tenant. Es correcto pero menos predecible; se mitiga propagando la razón al usuario y, en el reason del tool, al LLM.
- Auto-reparación puede sorprender al LLM si no se le devuelve: clavado que CanvasResult.reason resuma los ajustes; sin ese feedback el agente repetiría specs malos.
- JSON-Schema con enums grandes (endpoints, piezas, recetas) crece y puede tensar el prompt/coste por turno; medir tokens tras F5 (fase explícita).
- Pérdida de cola larga: composiciones atípicas (3 charts en fila, layout asimétrico) dejan de ser posibles. Es la apuesta del usuario; si aparece demanda real, se añade una receta nueva al enum, no se reabre el árbol libre.

## Preguntas abiertas (decisiones del usuario)

- ¿Confirmas RETIRAR el composite v1 (type+root) de la superficie del agente en F6, dejándolo solo como hidratación de layouts ya guardados? Es lo que recomiendo; alternativa: mantenerlo como escape hatch para casos atípicos (reabre algo de riesgo de feo).
- ¿Lista inicial de recetas correcta? Propongo 5: kpiRow, kpiRow+oneChart, kpiRow+twoCharts, heroChart+sideStats, tableFull. ¿Falta alguna composición que el negocio CBD pida a menudo?
- ¿Set de 4 bloques suficiente para el MVP (SalesOverview, StockRisk, StaffPerformance, ProductRanking) o añadimos MarginHealthBlock desde el principio (hay /dashboard/margin-kpis en la allowlist)?
- La degradación por nº de categorías la clavo EN LA PIEZA (en render, con datos). ¿De acuerdo, o prefieres pre-consultar el conteo en validación para que el agente lo sepa antes? Recomiendo en la pieza (más simple, sin fetch extra).
- ¿Caps por defecto OK? rankBarList 10 filas, comparisonBars 8 barras, shareDonut 6 categorías, dataGrid sin cap (scroll). Ajustables por enum clampado.
- Anti-drift: ¿prefieres un test de paridad TS↔Rust (rápido de montar) o generar la allowlist desde una fuente única (más robusto pero más obra)? Recomiendo empezar por el test de paridad.
