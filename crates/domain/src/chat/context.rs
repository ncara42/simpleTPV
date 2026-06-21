//! Construcción del system prompt del chatbot agente (#188, Fase 5).
//!
//! El prompt se regenera en CADA mensaje porque incorpora el estado del lienzo
//! (`canvas_state`), que viaja fresco en el body del `POST /chat/stream` (no se lee del
//! snapshot persistido, que puede estar stale). Da al LLM: contexto de la organización,
//! catálogo de widgets, herramientas filtradas por rol, la allowlist de endpoints para
//! widgets genéricos (segunda capa de defensa tras `applyCanvasOp` en el frontend) con los
//! campos de cada respuesta, el estado actual del lienzo y las instrucciones de comportamiento.

use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use simpletpv_db::with_tenant_tx;

/// Contexto de la organización para el system prompt. Datos ya consultados (la función que
/// construye el prompt es pura y testeable sin BD).
#[derive(Debug, Clone)]
pub struct OrgContext {
    pub name: String,
    pub country: String,
    pub locale: String,
    pub currency: String,
    pub store_count: i64,
    pub product_count: i64,
    pub employee_count: i64,
}

/// Catálogo de widgets del dashboard (espejo de `WIDGET_LABELS` en
/// `apps/backoffice/src/widgets/registry.ts`). El LLM usa estos ids en `add_widget`.
const WIDGET_CATALOG: &[(&str, &str)] = &[
    ("kpi-today", "Facturación hoy"),
    ("kpi-avg-ticket", "Ticket medio"),
    ("kpi-upt", "Unidades por ticket (UPT)"),
    ("kpi-margin", "% Margen"),
    ("kpi-profit", "Beneficio"),
    ("kpi-discount", "Tasa de descuento"),
    ("kpi-return", "Tasa de devolución"),
    ("kpi-lost-sales", "Venta perdida estimada"),
    ("dash-bars", "Ventas (gráfico)"),
    ("dash-hour", "Ventas por hora"),
    ("dash-family", "Ventas por familia"),
    ("rank-sales", "Ranking de productos por ventas"),
    ("rank-margin", "Ranking de productos por margen"),
    ("rank-rotation", "Ranking de productos por rotación"),
    ("dash-stockout", "Roturas de stock"),
    ("dash-expiring", "Lotes por caducar"),
    ("dash-purchase-orders", "Pedidos de compra"),
    ("dash-sales-emp", "Ventas por vendedor"),
    ("dash-discount-emp", "Descuento por empleado"),
    ("dash-suppliers", "Comparativa de proveedores"),
    ("dash-rotation", "Rotación de productos"),
    ("dash-timeclock", "Fichajes de hoy"),
    // Bloques pre-cableados (#205): un panel entero ya diseñado con UNA llamada (lo más fácil).
    (
        "block:sales-overview",
        "BLOQUE — Resumen de ventas (KPIs + tendencia por hora)",
    ),
    (
        "block:stock-risk",
        "BLOQUE — Riesgo de stock (venta perdida + alertas + caducidades)",
    ),
    (
        "block:staff-performance",
        "BLOQUE — Rendimiento del equipo (ranking de ventas por vendedor)",
    ),
    (
        "block:product-ranking",
        "BLOQUE — Ranking de productos por ventas",
    ),
    (
        "gen:panel",
        "Panel a medida por receta + piezas (combina varias métricas en una tarjeta)",
    ),
];

/// Allowlist de endpoints (solo lectura/GET) que puede apuntar un widget genérico, con los
/// campos de su respuesta (camelCase) para que el LLM configure `genericSpec.fields` sin
/// adivinar. Segunda capa de defensa: el frontend (`applyCanvasOp`, F4.2) rechaza cualquier
/// endpoint fuera de esta lista. NO se incluye NINGÚN endpoint de escritura (POST/PUT/DELETE).
const WIDGETABLE_ENDPOINTS: &[(&str, &str, &str)] = &[
    (
        "/dashboard/sales-by-family",
        "Ventas desglosadas por familia de producto.",
        "familyName, total, color",
    ),
    (
        "/dashboard/sales-by-hour",
        "Ventas agrupadas por hora del día.",
        "hour, revenue, count",
    ),
    (
        "/dashboard/sales-by-employee",
        "Ventas por vendedor.",
        "userName, total, salesCount",
    ),
    (
        "/dashboard/discount-by-employee",
        "Descuento medio aplicado por empleado.",
        "userName, avgDiscountPct, salesCount",
    ),
    (
        "/dashboard/product-rankings",
        "Ranking de productos por ventas, margen o rotación (param: rankBy).",
        "name, total, units",
    ),
    (
        "/dashboard/sales-kpis",
        "KPIs de ventas del periodo.",
        "revenue, avgTicket, upt, discountRate, returnRate",
    ),
    (
        "/dashboard/margin-kpis",
        "KPIs de margen del periodo.",
        "grossMargin, realMargin, marginPct, revenue",
    ),
    (
        "/dashboard/stockout-kpis",
        "KPIs de roturas de stock.",
        "events, resolved, open, rate, estimatedLostSales",
    ),
    (
        "/stock/alerts",
        "Productos agotados o por debajo del mínimo.",
        "productName, storeName, alertType, severity",
    ),
    (
        "/stock/expiring",
        "Lotes próximos a caducar.",
        "productName, lotCode, expiryDate, quantity, daysToExpiry",
    ),
    (
        "/products",
        "Catálogo de productos activos.",
        "name, sku, salePrice, active",
    ),
    (
        "/product-families",
        "Árbol de familias de producto.",
        "name, parentId, archetype",
    ),
    (
        "/suppliers",
        "Proveedores de la organización.",
        "name, contact, productCount",
    ),
];

const BEHAVIOR: &str = "\
## Comportamiento esperado

1. Responde SIEMPRE en español de España (tuteo peninsular). Sé conciso y directo.
2. No inventes datos: consulta siempre la herramienta correspondiente. Si una herramienta \
falla, comunícalo con claridad. Si falla por timeout, di «hubo un retraso, comprueba el lienzo».
3. Ante ambigüedad (qué tienda, qué periodo), pregunta antes de actuar o usa valores por \
defecto razonables (periodo: hoy; tienda: todas).
4. El lienzo es siempre un lienzo libre: añade formas, texto y notas directamente con \
`add_shape`/`add_text`/`add_note`/`add_insight`.
5. Usa `arrange` para reordenar y compactar los elementos del lienzo cuando queden desordenados.
6. No uses `clear_canvas` ni `remove_element` si el usuario podría querer revertir la acción: \
esas operaciones no se deshacen al editar o regenerar el historial.
7. Para datos a medida usa un bloque (`block:<id>`) o un panel (`gen:panel`); sus piezas solo pueden \
apuntar a endpoints de la lista permitida.
8. Cuando uses herramientas de canvas, explica brevemente al usuario lo que añades o modificas.";

/// Guía del DSL v2 de paneles (#206): catálogo de BLOQUES + RECETAS + PIEZAS. Sin reglas de diseño
/// en prosa: el diseño está HORNEADO en cada pieza (orden, cap de barras, donut≤6, formato es-ES) y
/// en cada receta (ancho/alto/columnas). El agente solo ENSAMBLA. Raw string para el JSON de ejemplo.
const PANEL_GUIDE: &str = r#"## Paneles a medida y bloques (DSL v2)

Para combinar varias métricas en UNA tarjeta tienes DOS caminos. Prefiere SIEMPRE el más simple.
NUNCA emitas geometría (w/h/span/gap): la receta y las piezas ya tienen su diseño horneado.

### A) Bloques pre-cableados (lo más fácil — un panel entero con UNA llamada)
`add_widget` con `widget_id` = uno de:
- `block:sales-overview` — KPIs de ventas (facturación, ticket medio, uds./ticket) + tendencia por hora.
- `block:stock-risk` — venta perdida estimada + roturas abiertas + tablas de alertas y caducidades.
- `block:staff-performance` — ranking de ventas por vendedor + nº de ventas por vendedor.
- `block:product-ranking` — top de productos por ventas.
`period` y `store_id` (de la propia llamada) se heredan por todas las piezas. No construyas slots.

### B) Panel a medida por receta + piezas (si ningún bloque encaja)
`add_widget` con `widget_id` "gen:panel" y `generic_spec`:
- `kind`: "panel"
- `recipe`: una de [kpiRow, kpiRow+oneChart, kpiRow+twoCharts, heroChart+sideStats, tableFull]. La receta DICTA el layout.
- `density`: "comfortable" | "compact"
- `title`: título de la tarjeta.
- `slots`: { "kpis": [piezas kpiTile], "charts": [piezas de gráfica/lista/tabla] }

Piezas (cada una bonita por construcción — no configuras estilo):
- `kpiTile` (slot kpis) — un número clave grande. Campos: endpoint, value_field, format?, title.
- `comparisonBars` (charts) — barras comparando categorías (vendedores/familias/tiendas). label_field + value_field.
- `trendLine` / `trendArea` (charts) — evolución temporal (por hora/día). label_field (eje temporal) + value_field.
- `shareDonut` (charts) — reparto de un total (degrada solo a barras si hay muchas categorías). label_field + value_field.
- `rankBarList` (charts) — ranking horizontal (top productos/vendedores). label_field + value_field, max_rows?.
- `segmentBar` (charts) — barra única de reparto. label_field + value_field.
- `progressMeter` (charts) — progreso hacia un objetivo. value_field + target?.
- `dataGrid` (charts) — tabla. columns: [{ field, label, format?, align? }].

`format` (eur, percent, decimal, units, integer) es OPCIONAL: si lo omites se infiere por el nombre del campo.
El `period`/`store_id` van en `params` de cada pieza (p. ej. "params": { "period": "month" }).
Una pieza en el slot equivocado se reubica sola; un endpoint fuera de la allowlist se descarta. No repitas reglas de maquetado.

Ejemplo — panel "Rendimiento de ventas — este mes" (recipe kpiRow+twoCharts):
{
  "kind": "panel",
  "recipe": "kpiRow+twoCharts",
  "density": "comfortable",
  "title": "Rendimiento de ventas — este mes",
  "slots": {
    "kpis": [
      { "piece": "kpiTile", "title": "Facturación", "endpoint": "/dashboard/sales-kpis", "value_field": "revenue", "format": "eur", "params": { "period": "month" } },
      { "piece": "kpiTile", "title": "Ticket medio", "endpoint": "/dashboard/sales-kpis", "value_field": "avgTicket", "format": "eur", "params": { "period": "month" } }
    ],
    "charts": [
      { "piece": "trendArea", "title": "Ventas por hora", "endpoint": "/dashboard/sales-by-hour", "label_field": "hour", "value_field": "revenue", "format": "eur", "params": { "period": "month" } },
      { "piece": "rankBarList", "title": "Top vendedores", "endpoint": "/dashboard/sales-by-employee", "label_field": "userName", "value_field": "total", "format": "eur", "params": { "period": "month" } }
    ]
  }
}
"#;

/// Carga el contexto de la organización (datos + recuentos) bajo el tenant del actor (RLS).
pub async fn load_org_context(pool: &PgPool, org: Uuid) -> Result<OrgContext, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let org_row: Option<(String, String, String, String)> = sqlx::query_as(
            r#"SELECT name, country, locale, currency FROM "Organization" WHERE id = $1"#,
        )
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let (name, country, locale, currency) = org_row.unwrap_or_else(|| {
            (
                "tu organización".to_owned(),
                "ES".to_owned(),
                "es-ES".to_owned(),
                "EUR".to_owned(),
            )
        });

        let store_count: i64 =
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "Store" WHERE "organizationId" = $1"#)
                .bind(org)
                .fetch_one(&mut **tx)
                .await?;
        let product_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "Product" WHERE "organizationId" = $1 AND active = true"#,
        )
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
        let employee_count: i64 =
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "User" WHERE "organizationId" = $1"#)
                .bind(org)
                .fetch_one(&mut **tx)
                .await?;

        Ok(OrgContext {
            name,
            country,
            locale,
            currency,
            store_count,
            product_count,
            employee_count,
        })
    })
    .await
}

/// Formatea el estado del lienzo (JSON enviado por el frontend) a texto legible para el LLM.
/// Espera `{ elements: [{ id, label, x?, y? }], totalElements }`. Trunca a 30 elementos
/// (el frontend ya trunca; cota defensiva). Razona con labels humanos pero conserva el id
/// interno entre corchetes para que las tools puedan referenciarlo.
fn format_canvas_state(canvas: Option<&serde_json::Value>) -> String {
    const MAX_ELEMENTS: usize = 30;
    let Some(canvas) = canvas else {
        return "No se ha enviado el estado del lienzo en este mensaje.".to_owned();
    };
    let empty: Vec<serde_json::Value> = Vec::new();
    let elements = canvas
        .get("elements")
        .and_then(|e| e.as_array())
        .unwrap_or(&empty);
    let total = canvas
        .get("totalElements")
        .and_then(|t| t.as_u64())
        .map(|t| t as usize)
        .unwrap_or(elements.len());

    if elements.is_empty() {
        return "El lienzo está vacío.".to_owned();
    }

    let mut out = format!(
        "Elementos del lienzo ({} de {total}):\n",
        elements.len().min(MAX_ELEMENTS),
    );
    for el in elements.iter().take(MAX_ELEMENTS) {
        let id = el.get("id").and_then(|v| v.as_str()).unwrap_or("?");
        let label = el.get("label").and_then(|v| v.as_str()).unwrap_or(id);
        match (
            el.get("x").and_then(|v| v.as_f64()),
            el.get("y").and_then(|v| v.as_f64()),
        ) {
            (Some(x), Some(y)) => {
                out.push_str(&format!(
                    "- {label} [{id}] (x≈{}, y≈{})\n",
                    x as i64, y as i64
                ));
            }
            _ => out.push_str(&format!("- {label} [{id}]\n")),
        }
    }
    if total > MAX_ELEMENTS {
        out.push_str(&format!(
            "… y {} elementos más (no listados).\n",
            total - MAX_ELEMENTS,
        ));
    }
    out
}

/// Bloque de contexto de la organización (común a todas las vistas).
fn push_org_context(p: &mut String, org: &OrgContext) {
    p.push_str("## Tu organización\n\n");
    p.push_str(&format!(
        "- Nombre: {}\n- País: {}\n- Moneda: {}\n- Locale: {}\n- Tiendas: {}\n- Productos \
activos: {}\n- Empleados: {}\n\n",
        org.name,
        org.country,
        org.currency,
        org.locale,
        org.store_count,
        org.product_count,
        org.employee_count,
    ));
}

/// Bloque de herramientas de datos filtradas por rol (común a todas las vistas).
fn push_data_tools(p: &mut String, is_admin: bool) {
    p.push_str(
        "## Herramientas de datos\n\nConsulta los datos reales con estas herramientas: \
`sales_kpis`, `sales_by_hour`, `sales_by_family`, `product_rankings`, `stock_alerts`, \
`purchase_orders`, `sales_by_employee`, `time_clock_today`.\n",
    );
    if is_admin {
        p.push_str(
            "Como administrador también dispones de: `stores_list`, `users_list`, \
`supplier_prices_comparison`.\n",
        );
    } else {
        p.push_str(
            "Las herramientas `stores_list`, `users_list` y `supplier_prices_comparison` \
están reservadas a administradores y no están disponibles para ti.\n",
        );
    }
    p.push_str(
        "Periodos válidos: today, yesterday, this_week, last_week, this_month, last_month, \
this_year.\n\n",
    );
}

/// Construye el system prompt completo. Función PURA (sin BD): recibe el contexto ya
/// consultado, el rol (para filtrar herramientas), el estado del lienzo de este mensaje y la
/// vista del backoffice donde está el usuario.
///
/// `view_id` ausente o `"dashboard"` ⇒ modo LIENZO: el asistente del dashboard, con catálogo de
/// widgets, paneles y estado del lienzo (comportamiento histórico). Cualquier otra vista ⇒ modo
/// INFORMATIVO: solo consulta y orienta sobre la pantalla actual (el backend además le retira las
/// herramientas de lienzo). `view_label` es la etiqueta humana para la prosa del prompt.
pub fn build_system_prompt(
    org: &OrgContext,
    is_admin: bool,
    canvas_state: Option<&serde_json::Value>,
    view_id: Option<&str>,
    view_label: Option<&str>,
) -> String {
    if matches!(view_id, None | Some("dashboard")) {
        build_dashboard_prompt(org, is_admin, canvas_state)
    } else {
        let label = view_label
            .filter(|l| !l.trim().is_empty())
            .unwrap_or("el backoffice");
        build_view_prompt(org, is_admin, label)
    }
}

/// Modo lienzo (Dashboard): asistente con herramientas de composición del tablero.
fn build_dashboard_prompt(
    org: &OrgContext,
    is_admin: bool,
    canvas_state: Option<&serde_json::Value>,
) -> String {
    let mut p = String::new();

    p.push_str(
        "Eres el asistente del dashboard de simpletpv, un punto de venta multitienda. Ayudas a \
gerentes y administradores a analizar datos de ventas, stock, personal y finanzas, y a \
componer el dashboard visual mediante herramientas.\n\n",
    );

    // 1. Contexto de la organización.
    push_org_context(&mut p, org);

    // 2. Catálogo de widgets.
    p.push_str("## Widgets del catálogo\n\nUsa estos ids en `add_widget` (campo `widget_id`):\n");
    for (id, label) in WIDGET_CATALOG {
        p.push_str(&format!("- `{id}` — {label}\n"));
    }
    p.push('\n');

    // 3. Herramientas de datos (filtradas por rol).
    push_data_tools(&mut p, is_admin);

    // 4. Allowlist de endpoints para widgets genéricos + campos de respuesta.
    p.push_str(
        "## Endpoints permitidos para widgets genéricos\n\nUn widget genérico \
(`add_widget` con `widget_id` `gen:<tipo>` y `generic_spec.endpoint`) SOLO puede apuntar a \
uno de estos endpoints de lectura. Cualquier otro será rechazado. Usa los campos indicados \
en `generic_spec.fields`:\n",
    );
    for (path, desc, fields) in WIDGETABLE_ENDPOINTS {
        p.push_str(&format!("- `{path}` — {desc} Campos: {fields}\n"));
    }
    p.push('\n');

    // 4b. Paneles a medida y bloques (DSL v2, #206).
    p.push_str(PANEL_GUIDE);
    p.push('\n');

    // 5. Estado actual del lienzo.
    p.push_str("## Estado actual del lienzo\n\n");
    p.push_str(&format_canvas_state(canvas_state));
    p.push_str("\n\n");

    // 6. Instrucciones de comportamiento.
    p.push_str(BEHAVIOR);

    p
}

/// Modo informativo (resto de vistas): el asistente consulta datos y orienta sobre la pantalla
/// actual, pero NO compone el tablero (no recibe herramientas de lienzo).
fn build_view_prompt(org: &OrgContext, is_admin: bool, view_label: &str) -> String {
    let mut p = String::new();

    p.push_str(&format!(
        "Eres el asistente de simpletpv, un punto de venta multitienda. Ayudas a gerentes y \
administradores a analizar sus datos de ventas, stock, personal y finanzas.\n\n\
Ahora mismo el usuario está en la vista «{view_label}» del backoffice (no en el dashboard). Tu \
papel aquí es informar y analizar sobre esta pantalla, no componer el tablero.\n\n",
    ));

    // Contexto de la organización + herramientas de datos (sin catálogo de widgets ni lienzo).
    push_org_context(&mut p, org);
    push_data_tools(&mut p, is_admin);

    // Herramientas de pantalla: actúan sobre la vista actual (no sobre el lienzo).
    p.push_str(
        "## Herramientas de pantalla\n\nPuedes actuar sobre la pantalla que el usuario tiene \
delante:\n\
- `highlight_on_view` — hace scroll hasta un elemento/sección/columna por su texto visible y lo \
resalta. Úsalo cuando pregunten dónde está algo o te pidan señalarlo.\n\
- `filter_view` — escribe en el buscador de la vista para filtrar el listado por texto (nombre, \
SKU, código…). Cadena vacía limpia el filtro.\n\
Estas acciones no modifican datos: son ayudas de navegación sobre la vista actual.\n\n",
    );

    p.push_str(&format!(
        "## Comportamiento esperado\n\n\
1. Responde SIEMPRE en español de España (tuteo peninsular). Sé conciso y directo.\n\
2. No inventes datos: consulta siempre la herramienta correspondiente. Si una herramienta \
falla, comunícalo con claridad.\n\
3. Ante ambigüedad (qué tienda, qué periodo), pregunta antes de actuar o usa valores por \
defecto razonables (periodo: hoy; tienda: todas).\n\
4. Estás ayudando sobre la vista «{view_label}»: orienta al usuario sobre lo que ve, resume sus \
datos y resuelve sus dudas. Si pregunta dónde está algo, usa `highlight_on_view`; si quiere \
filtrar el listado, usa `filter_view`.\n\
5. NO dispones de las herramientas del lienzo (añadir o mover widgets, formas o notas): solo el \
Dashboard permite componer el tablero. Si el usuario te pide montar o cambiar widgets, dile que \
cambie al Dashboard para hacerlo.\n",
    ));

    p
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_org() -> OrgContext {
        OrgContext {
            name: "CBD Premium".to_owned(),
            country: "ES".to_owned(),
            locale: "es-ES".to_owned(),
            currency: "EUR".to_owned(),
            store_count: 7,
            product_count: 240,
            employee_count: 15,
        }
    }

    #[test]
    fn incluye_contexto_de_organizacion() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("CBD Premium"));
        assert!(p.contains("Tiendas: 7"));
        assert!(p.contains("Productos activos: 240"));
        assert!(p.contains("Empleados: 15"));
        assert!(p.contains("Moneda: EUR"));
        assert!(p.contains("Locale: es-ES"));
    }

    #[test]
    fn incluye_catalogo_de_widgets() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("kpi-today"));
        assert!(p.contains("dash-timeclock"));
        // Los 22 widgets del catálogo aparecen listados.
        for (id, _) in WIDGET_CATALOG {
            assert!(p.contains(id), "falta el widget {id} en el prompt");
        }
    }

    #[test]
    fn filtra_herramientas_admin_por_rol() {
        let admin = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(admin.contains("también dispones de"));
        assert!(admin.contains("users_list"));

        let manager = build_system_prompt(&sample_org(), false, None, None, None);
        assert!(manager.contains("reservadas a administradores"));
    }

    #[test]
    fn incluye_allowlist_de_endpoints_sin_escritura() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("/dashboard/sales-by-family"));
        assert!(p.contains("/stock/alerts"));
        assert!(p.contains("Campos:"));
        // Ningún endpoint de escritura debe colarse en la allowlist.
        assert!(!p.contains("POST"));
        assert!(!p.contains("DELETE"));
    }

    #[test]
    fn incluye_instrucciones_de_comportamiento() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("español de España"));
        // `set_mode` se eliminó: el lienzo es siempre libre, no hay modo que cambiar.
        assert!(!p.contains("set_mode"));
        assert!(p.contains("arrange"));
        assert!(p.contains("clear_canvas"));
    }

    #[test]
    fn modo_vista_informa_y_oculta_el_lienzo() {
        let p = build_system_prompt(&sample_org(), true, None, Some("sales"), Some("Ventas"));
        // Menciona la vista y deja claro que no compone el tablero.
        assert!(p.contains("vista «Ventas»"));
        assert!(p.contains("no en el dashboard"));
        assert!(p.contains("NO dispones de las herramientas del lienzo"));
        // No inyecta la superficie del lienzo (catálogo, paneles, estado).
        assert!(!p.contains("Widgets del catálogo"));
        assert!(!p.contains("Paneles a medida y bloques"));
        assert!(!p.contains("Estado actual del lienzo"));
        // Pero sigue ofreciendo herramientas de datos para informar.
        assert!(p.contains("sales_kpis"));
        assert!(p.contains("español de España"));
        // Y ofrece las herramientas de pantalla (scroll/resaltar/filtrar).
        assert!(p.contains("highlight_on_view"));
        assert!(p.contains("filter_view"));
    }

    #[test]
    fn sin_view_o_dashboard_usa_el_modo_lienzo() {
        // Ausencia de vista (compat) y vista "dashboard" ⇒ prompt de lienzo completo.
        let sin_view = build_system_prompt(&sample_org(), true, None, None, None);
        let dashboard = build_system_prompt(
            &sample_org(),
            true,
            None,
            Some("dashboard"),
            Some("Dashboard"),
        );
        for p in [&sin_view, &dashboard] {
            assert!(p.contains("Widgets del catálogo"));
            assert!(p.contains("Paneles a medida y bloques"));
        }
    }

    #[test]
    fn modo_vista_con_etiqueta_vacia_usa_fallback() {
        let p = build_system_prompt(&sample_org(), true, None, Some("sales"), Some("  "));
        assert!(p.contains("vista «el backoffice»"));
    }

    #[test]
    fn incluye_seccion_de_paneles_v2_con_bloques_recetas_y_piezas() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("Paneles a medida y bloques"));
        // Superficie v2: gen:panel + bloques pre-cableados.
        assert!(p.contains("gen:panel"));
        assert!(p.contains("block:sales-overview"));
        assert!(p.contains("block:stock-risk"));
        // Recetas y piezas (vocabulario v2), no nodos del árbol v1.
        assert!(p.contains("kpiRow+twoCharts"));
        assert!(p.contains("kpiTile"));
        assert!(p.contains("rankBarList"));
        assert!(p.contains("/dashboard/sales-kpis"));
        // El DSL v1 (stack/leaf) NO aparece en el prompt: se retiró de la superficie del agente.
        assert!(!p.contains("\"kind\": \"stack\""));
        assert!(!p.contains("\"kind\": \"leaf\""));
        // Sin endpoints de escritura.
        assert!(!p.contains("POST"));
        assert!(!p.contains("DELETE"));
    }

    #[test]
    fn el_prompt_no_se_dispara_en_tamano() {
        // F5 (#206): el catálogo de piezas/recetas/bloques NO debe inflar el prompt frente al
        // antiguo COMPOSITE_GUIDE (que ya tenía ~55 líneas de prosa). Cota holgada como guardia.
        // Tamaño actual ~8,5k chars (~2,1k tokens). Cota a 11k = guardia anti-runaway (no doblar).
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        eprintln!("system_prompt chars = {}", p.len());
        assert!(
            p.len() < 11_000,
            "el system prompt creció demasiado: {} chars",
            p.len()
        );
    }

    #[test]
    fn paridad_endpoints_y_bloques_con_contrato_compartido() {
        // Fuente única: docs/contracts/dataviz-contract.json (test gemelo en TS y en crates/ai).
        let contract: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../docs/contracts/dataviz-contract.json"
        ))
        .expect("contrato JSON válido");
        let from_contract = |k: &str| -> Vec<String> {
            contract[k]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().to_string())
                .collect()
        };

        let mut endpoints: Vec<String> = WIDGETABLE_ENDPOINTS
            .iter()
            .map(|(p, _, _)| p.to_string())
            .collect();
        let mut contract_eps = from_contract("endpoints");
        endpoints.sort();
        contract_eps.sort();
        assert_eq!(endpoints, contract_eps, "endpoints del prompt vs contrato");

        // Los bloques del catálogo del prompt (ids con prefijo block:) deben coincidir con el contrato.
        let mut blocks: Vec<String> = WIDGET_CATALOG
            .iter()
            .filter_map(|(id, _)| id.strip_prefix("block:").map(str::to_string))
            .collect();
        let mut contract_blocks = from_contract("blocks");
        blocks.sort();
        contract_blocks.sort();
        assert_eq!(blocks, contract_blocks, "bloques del catálogo vs contrato");
    }

    #[test]
    fn sin_canvas_state_lo_indica() {
        let p = build_system_prompt(&sample_org(), true, None, None, None);
        assert!(p.contains("No se ha enviado el estado del lienzo"));
    }

    #[test]
    fn formatea_canvas_state_con_labels_e_ids() {
        let canvas = serde_json::json!({
            "elements": [
                { "id": "dash-hour", "label": "Ventas por hora", "x": 120.0, "y": 80.0 },
                { "id": "gen:abc", "label": "Top productos" },
            ],
            "totalElements": 2,
        });
        let p = build_system_prompt(&sample_org(), true, Some(&canvas), None, None);
        assert!(p.contains("Elementos del lienzo"));
        assert!(p.contains("Ventas por hora [dash-hour]"));
        assert!(p.contains("Top productos [gen:abc]"));
        assert!(p.contains("x≈120"));
    }

    #[test]
    fn trunca_el_canvas_a_30_elementos() {
        let elements: Vec<serde_json::Value> = (0..50)
            .map(|i| serde_json::json!({ "id": format!("w{i}"), "label": format!("W{i}") }))
            .collect();
        let canvas = serde_json::json!({
            "elements": elements,
            "totalElements": 50,
        });
        let p = build_system_prompt(&sample_org(), true, Some(&canvas), None, None);
        assert!(p.contains("Elementos del lienzo (30 de 50)"));
        assert!(p.contains("W0 [w0]"));
        assert!(p.contains("20 elementos más"));
        // El elemento 35 está más allá del truncado: no aparece.
        assert!(!p.contains("W35 [w35]"));
    }
}
