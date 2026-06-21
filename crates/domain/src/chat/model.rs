use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::PrimitiveDateTime;
use uuid::Uuid;

// Las columnas en BD son camelCase (convención Prisma); las queries del módulo
// usan `SELECT *`/`RETURNING *`, así que `FromRow` necesita `#[sqlx(rename)]`
// para casar cada campo snake_case con su columna (los `#[serde(rename)]` solo
// afectan a la serialización JSON, no a la decodificación de SQLx).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChatConversationRow {
    pub id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    #[serde(rename = "userId")]
    #[sqlx(rename = "userId")]
    pub user_id: Uuid,
    pub title: Option<String>,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
    #[serde(rename = "updatedAt")]
    #[sqlx(rename = "updatedAt")]
    pub updated_at: PrimitiveDateTime,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChatMessageRow {
    pub id: Uuid,
    #[serde(rename = "conversationId")]
    #[sqlx(rename = "conversationId")]
    pub conversation_id: Uuid,
    #[serde(rename = "organizationId")]
    #[sqlx(rename = "organizationId")]
    pub organization_id: Uuid,
    pub role: String,
    pub content: serde_json::Value,
    #[serde(rename = "toolCalls")]
    #[sqlx(rename = "toolCalls")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(rename = "toolResults")]
    #[sqlx(rename = "toolResults")]
    pub tool_results: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "createdAt")]
    pub created_at: PrimitiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct InsertConversation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InsertMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub organization_id: Uuid,
    pub role: String,
    pub content: serde_json::Value,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_results: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "costEur")]
    pub cost_eur: String,
}

#[derive(Debug, Serialize)]
pub struct ConversationUsage {
    pub total: UsageSummary,
    pub turns: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgUsageByModel {
    pub model: String,
    pub provider: String,
    #[serde(rename = "costEur")]
    pub cost_eur: String,
    pub turns: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgUsageSummary {
    #[serde(rename = "totalCostEur")]
    pub total_cost_eur: String,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "byModel")]
    pub by_model: Vec<OrgUsageByModel>,
}

// Ops de lienzo que el frontend necesita deshacer al truncar historial.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasOp {
    pub op: String,
    #[serde(rename = "elementId", skip_serializing_if = "Option::is_none")]
    pub element_id: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

impl CanvasOp {
    /// Construye una op de lienzo desde una tool call del LLM, normalizando las claves de los
    /// argumentos de snake_case (como las declara el esquema de las tools: `widget_id`,
    /// `store_id`, `generic_spec`…) a camelCase, que es lo que `applyCanvasOp` del frontend
    /// espera (`widgetId`, `storeId`, `genericSpec`). Sin esto, `add_widget` se rechaza con
    /// "add_widget sin widgetId" y el widget no se coloca aunque el agente lo anuncie.
    /// `elementId` lo lleva su propio campo, así que se quita de `extra` para no duplicarlo al
    /// aplanar.
    pub fn from_tool_call(name: &str, args: &serde_json::Value) -> Self {
        let element_id = args["element_id"].as_str().map(|s| s.to_owned());
        let mut extra = camel_case_keys(args);
        if let Some(obj) = extra.as_object_mut() {
            obj.remove("elementId");
        }
        Self {
            op: name.to_owned(),
            element_id,
            extra,
        }
    }
}

/// Convierte a camelCase las claves de NIVEL SUPERIOR de un objeto JSON (deja intactos los
/// valores anidados para no tocar, p.ej., los `params` de un widget genérico).
fn camel_case_keys(v: &serde_json::Value) -> serde_json::Value {
    match v.as_object() {
        Some(map) => serde_json::Value::Object(
            map.iter()
                .map(|(k, val)| (snake_to_camel(k), val.clone()))
                .collect(),
        ),
        None => v.clone(),
    }
}

fn snake_to_camel(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut upper = false;
    for c in s.chars() {
        if c == '_' {
            upper = true;
        } else if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod canvas_op_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn from_tool_call_normaliza_widget_id_a_camel() {
        let op = CanvasOp::from_tool_call(
            "add_widget",
            &json!({ "widget_id": "kpi-today", "position": "top-left", "element_id": "e1" }),
        );
        assert_eq!(op.op, "add_widget");
        assert_eq!(op.element_id.as_deref(), Some("e1"));
        // El frontend lee `widgetId` (camelCase) — debe existir tras la normalización.
        assert_eq!(op.extra["widgetId"], json!("kpi-today"));
        assert_eq!(op.extra["position"], json!("top-left"));
        // `elementId` se sirve por su campo propio, no duplicado dentro de `extra`.
        assert!(op.extra.get("elementId").is_none());
    }

    #[test]
    fn from_tool_call_preserva_arbol_composite() {
        let args = json!({
            "widget_id": "gen:composite",
            "element_id": "elem-1",
            "position": "center",
            "generic_spec": {
                "type": "composite",
                "title": "Panel rendimiento",
                "endpoint": "",
                "root": {
                    "kind": "stack",
                    "dir": "row",
                    "children": [
                        { "kind": "leaf", "spec": { "type": "bar", "endpoint": "/dashboard/sales-by-employee", "title": "Ventas" } },
                        { "kind": "leaf", "spec": { "type": "kpi", "endpoint": "/dashboard/sales-kpis", "title": "KPI" } }
                    ]
                }
            }
        });
        let op = CanvasOp::from_tool_call("add_widget", &args);
        // camel_case_keys normaliza el nivel superior: generic_spec → genericSpec.
        let spec = &op.extra["genericSpec"];
        assert_eq!(spec["type"], "composite");
        // El árbol anidado llega intacto (camel_case_keys no toca valores anidados).
        assert_eq!(spec["root"]["kind"], "stack");
        assert_eq!(spec["root"]["children"].as_array().unwrap().len(), 2);
        assert_eq!(
            spec["root"]["children"][0]["spec"]["endpoint"],
            "/dashboard/sales-by-employee"
        );
    }
}

#[derive(Debug, Serialize)]
pub struct PruneResult {
    pub pruned: i64,
    #[serde(rename = "canvasOpsToUndo")]
    pub canvas_ops_to_undo: Vec<CanvasOp>,
}

#[derive(Debug, Deserialize)]
pub struct RecordUsageInput {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub conversation_id: Option<Uuid>,
    pub provider: String,
    pub model: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cost_eur: Decimal,
    pub aborted: bool,
}
