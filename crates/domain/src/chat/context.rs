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
        "productName, storeName, quantity, threshold",
    ),
    (
        "/stock/expiring",
        "Lotes próximos a caducar.",
        "productName, batch, expiresAt, quantity",
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
4. Para dibujar formas, texto o notas necesitas el modo Libre. Si estás en Cuadrícula, \
pregunta antes de cambiar con `set_mode`. NO invoques `add_shape`/`add_text`/`add_note`/\
`add_insight` sin haber cambiado a Libre.
5. `arrange` solo aplica en modo Libre; en Cuadrícula el grid ya está compacto, no lo invoques.
6. No uses `clear_canvas` ni `remove_element` si el usuario podría querer revertir la acción: \
esas operaciones no se deshacen al editar o regenerar el historial.
7. Los widgets genéricos (`gen:<tipo>`) solo pueden apuntar a endpoints de la lista permitida.
8. Cuando uses herramientas de canvas, explica brevemente al usuario lo que añades o modificas.";

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
/// Espera `{ mode, elements: [{ id, label, x?, y? }], totalElements }`. Trunca a 30 elementos
/// (el frontend ya trunca; cota defensiva). Razona con labels humanos pero conserva el id
/// interno entre corchetes para que las tools puedan referenciarlo.
fn format_canvas_state(canvas: Option<&serde_json::Value>) -> String {
    const MAX_ELEMENTS: usize = 30;
    let Some(canvas) = canvas else {
        return "No se ha enviado el estado del lienzo en este mensaje.".to_owned();
    };
    let mode = canvas
        .get("mode")
        .and_then(|m| m.as_str())
        .unwrap_or("grid");
    let mode_label = if mode == "free" {
        "Libre"
    } else {
        "Cuadrícula"
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
        return format!("Modo activo: {mode_label}. El lienzo está vacío.");
    }

    let mut out = format!(
        "Modo activo: {mode_label}. Elementos ({} de {total}):\n",
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

/// Construye el system prompt completo. Función PURA (sin BD): recibe el contexto ya
/// consultado, el rol (para filtrar herramientas) y el estado del lienzo de este mensaje.
pub fn build_system_prompt(
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

    // 2. Catálogo de widgets.
    p.push_str("## Widgets del catálogo\n\nUsa estos ids en `add_widget` (campo `widget_id`):\n");
    for (id, label) in WIDGET_CATALOG {
        p.push_str(&format!("- `{id}` — {label}\n"));
    }
    p.push('\n');

    // 3. Herramientas de datos (filtradas por rol).
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

    // 5. Estado actual del lienzo.
    p.push_str("## Estado actual del lienzo\n\n");
    p.push_str(&format_canvas_state(canvas_state));
    p.push_str("\n\n");

    // 6. Instrucciones de comportamiento.
    p.push_str(BEHAVIOR);

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
        let p = build_system_prompt(&sample_org(), true, None);
        assert!(p.contains("CBD Premium"));
        assert!(p.contains("Tiendas: 7"));
        assert!(p.contains("Productos activos: 240"));
        assert!(p.contains("Empleados: 15"));
        assert!(p.contains("Moneda: EUR"));
        assert!(p.contains("Locale: es-ES"));
    }

    #[test]
    fn incluye_catalogo_de_widgets() {
        let p = build_system_prompt(&sample_org(), true, None);
        assert!(p.contains("kpi-today"));
        assert!(p.contains("dash-timeclock"));
        // Los 22 widgets del catálogo aparecen listados.
        for (id, _) in WIDGET_CATALOG {
            assert!(p.contains(id), "falta el widget {id} en el prompt");
        }
    }

    #[test]
    fn filtra_herramientas_admin_por_rol() {
        let admin = build_system_prompt(&sample_org(), true, None);
        assert!(admin.contains("también dispones de"));
        assert!(admin.contains("users_list"));

        let manager = build_system_prompt(&sample_org(), false, None);
        assert!(manager.contains("reservadas a administradores"));
    }

    #[test]
    fn incluye_allowlist_de_endpoints_sin_escritura() {
        let p = build_system_prompt(&sample_org(), true, None);
        assert!(p.contains("/dashboard/sales-by-family"));
        assert!(p.contains("/stock/alerts"));
        assert!(p.contains("Campos:"));
        // Ningún endpoint de escritura debe colarse en la allowlist.
        assert!(!p.contains("POST"));
        assert!(!p.contains("DELETE"));
    }

    #[test]
    fn incluye_instrucciones_de_comportamiento() {
        let p = build_system_prompt(&sample_org(), true, None);
        assert!(p.contains("español de España"));
        assert!(p.contains("set_mode"));
        assert!(p.contains("arrange"));
        assert!(p.contains("clear_canvas"));
    }

    #[test]
    fn sin_canvas_state_lo_indica() {
        let p = build_system_prompt(&sample_org(), true, None);
        assert!(p.contains("No se ha enviado el estado del lienzo"));
    }

    #[test]
    fn formatea_canvas_state_con_labels_e_ids() {
        let canvas = serde_json::json!({
            "mode": "free",
            "elements": [
                { "id": "dash-hour", "label": "Ventas por hora", "x": 120.0, "y": 80.0 },
                { "id": "gen:abc", "label": "Top productos" },
            ],
            "totalElements": 2,
        });
        let p = build_system_prompt(&sample_org(), true, Some(&canvas));
        assert!(p.contains("Modo activo: Libre"));
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
            "mode": "grid",
            "elements": elements,
            "totalElements": 50,
        });
        let p = build_system_prompt(&sample_org(), true, Some(&canvas));
        assert!(p.contains("Modo activo: Cuadrícula"));
        assert!(p.contains("W0 [w0]"));
        assert!(p.contains("20 elementos más"));
        // El elemento 35 está más allá del truncado: no aparece.
        assert!(!p.contains("W35 [w35]"));
    }
}
