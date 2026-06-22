use serde_json::{json, Value};

// Catálogo de tools que el LLM puede invocar. Divididas en:
//   - Canvas ops: modifican el lienzo del dashboard.
//   - Data queries: consultan datos de la organización.
// El backend filtra la lista por rol del AuthUser antes de enviarla al LLM.

// ── Vocabulario v2 del dashboard (#206, EPIC #201) ──────────────────────────────
// Espejo del contrato docs/contracts/dataviz-contract.json y de
// apps/backoffice/src/lib/dashboard-pieces.ts. El constrained decoding del function-calling impide
// piezas/recetas/endpoints inválidos mejor que la prosa. La PARIDAD se verifica en los tests.
pub const PIECES: &[&str] = &[
    "kpiTile",
    "comparisonBars",
    "trendLine",
    "trendArea",
    "shareDonut",
    "rankBarList",
    "segmentBar",
    "progressMeter",
    "stockAlertList",
    "dataGrid",
];
const KPI_PIECES: &[&str] = &["kpiTile"];
const CHART_PIECES: &[&str] = &[
    "comparisonBars",
    "trendLine",
    "trendArea",
    "shareDonut",
    "rankBarList",
    "segmentBar",
    "progressMeter",
    "stockAlertList",
    "dataGrid",
];
pub const RECIPES: &[&str] = &[
    "kpiRow",
    "kpiRow+oneChart",
    "kpiRow+twoCharts",
    "heroChart+sideStats",
    "tableFull",
];
pub const FORMATS: &[&str] = &[
    "eur",
    "percent",
    "percentRatio",
    "decimal",
    "units",
    "integer",
];
pub const WIDGETABLE_ENDPOINTS: &[&str] = &[
    "/dashboard/sales-by-family",
    "/dashboard/sales-by-hour",
    "/dashboard/sales-by-employee",
    "/dashboard/sales-by-store",
    "/dashboard/discount-by-employee",
    "/dashboard/product-rankings",
    "/dashboard/sales-kpis",
    "/dashboard/margin-kpis",
    "/dashboard/stockout-kpis",
    "/stock/alerts",
    "/stock/expiring",
    "/products",
    "/product-families",
    "/suppliers",
];
pub const BLOCK_IDS: &[&str] = &[
    "block:sales-overview",
    "block:stock-risk",
    "block:staff-performance",
    "block:product-ranking",
    "block:top-margin",
    "block:dead-stock",
    "block:profitability",
    "block:discount-control",
    "block:sales-mix",
    "block:store-comparison",
];

// Esquema de una hoja-pieza para un slot. `pieces` acota el enum admitido (kpis vs charts).
fn piece_item_schema(pieces: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": {
            "piece": { "type": "string", "enum": pieces, "description": "Molécula con diseño horneado (orden, cap, formato, degradación)." },
            "title": { "type": "string", "description": "Rótulo corto de la pieza." },
            "endpoint": { "type": "string", "enum": WIDGETABLE_ENDPOINTS, "description": "Endpoint de lectura de la allowlist." },
            "label_field": { "type": "string", "description": "Campo de etiqueta (eje X / categoría)." },
            "value_field": { "type": "string", "description": "Campo numérico del valor." },
            "format": { "type": "string", "enum": FORMATS, "description": "Formato es-ES; si se omite se infiere por el nombre del campo." },
            "max_bars": { "type": "integer", "minimum": 1, "maximum": 12, "description": "Solo comparisonBars (clamp a 8)." },
            "max_rows": { "type": "integer", "minimum": 1, "maximum": 10, "description": "Solo rankBarList/dataGrid." },
            "columns": { "type": "array", "description": "Solo dataGrid: [{ field, label, format?, align? }].", "items": { "type": "object" } }
        },
        "required": ["piece", "endpoint"]
    })
}

pub fn canvas_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "add_widget",
                "description": "Añade un widget al dashboard. TRES formas, de menos a más esfuerzo: (1) BLOQUE pre-cableado (widget_id 'block:<id>') = un panel entero ya diseñado con UNA llamada — el preferido; (2) widget del CATÁLOGO simple (widget_id 'kpi-today', 'dash-bars', …); (3) PANEL a medida (widget_id 'gen:panel' + generic_spec con kind 'panel', recipe y slots). NO emitas geometría (w/h/span/gap): la receta dicta el layout. Para combinar varias métricas en una tarjeta usa un bloque o gen:panel (no hay árbol de layout libre).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "widget_id": {
                            "type": "string",
                            "description": "ID del widget. Bloques (un panel entero ya diseñado, PREFIÉRELOS): 'block:sales-overview', 'block:stock-risk', 'block:staff-performance', 'block:product-ranking', 'block:top-margin', 'block:dead-stock', 'block:profitability', 'block:discount-control', 'block:sales-mix', 'block:store-comparison'. Catálogo (1 métrica): 'kpi-today', 'dash-bars', etc. Panel a medida (si ningún bloque encaja): 'gen:panel'."
                        },
                        "position": {
                            "type": "string",
                            "enum": ["top-left", "top-right", "top-center", "center", "bottom-left", "bottom-right", "bottom-center"],
                            "description": "Posición semántica en el lienzo. El frontend traduce a coordenadas reales."
                        },
                        "period": {
                            "type": "string",
                            "enum": ["today", "yesterday", "week", "month", "quarter", "year"],
                            "description": "Periodo de datos. Por defecto 'today'. En bloques/paneles se hereda por todas las piezas."
                        },
                        "store_id": {
                            "type": "string",
                            "description": "ID de tienda. Si se omite, muestra datos de todas las tiendas."
                        },
                        "element_id": {
                            "type": "string",
                            "description": "Identificador único del elemento en el lienzo (cualquier cadena única basta, p. ej. 'kpi-rev-1'; no hace falta un UUID real). Requerido para que el frontend pueda deshacer la operación."
                        },
                        "generic_spec": {
                            "type": "object",
                            "description": "Solo para 'gen:panel'. DSL v2: kind 'panel' + recipe (dicta el layout) + slots con piezas. Cada pieza ya tiene su diseño horneado; tú solo ENSAMBLAS.",
                            "properties": {
                                "kind": { "type": "string", "enum": ["panel"], "description": "Usa 'panel' (DSL v2)." },
                                "recipe": { "type": "string", "enum": RECIPES, "description": "Receta cerrada: define ancho/alto/columnas. No emitas geometría." },
                                "density": { "type": "string", "enum": ["compact", "comfortable"] },
                                "title": { "type": "string", "description": "Título de la tarjeta." },
                                "slots": {
                                    "type": "object",
                                    "description": "Piezas por slot tipado. 'kpis' solo admite kpiTile; 'charts' admite gráficas/listas/tablas. Una pieza en el slot equivocado se reubica.",
                                    "properties": {
                                        "kpis": { "type": "array", "items": piece_item_schema(KPI_PIECES) },
                                        "charts": { "type": "array", "items": piece_item_schema(CHART_PIECES) }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["widget_id", "position", "element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "remove_element",
                "description": "Elimina un elemento del lienzo por su element_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "element_id": { "type": "string", "description": "ID del elemento a eliminar." }
                    },
                    "required": ["element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_shape",
                "description": "Añade una forma geométrica al lienzo libre. Solo disponible en modo libre.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "kind": { "type": "string", "enum": ["rect", "ellipse", "line", "arrow"] },
                        "position": { "type": "string", "enum": ["top-left", "top-right", "center", "bottom-left", "bottom-right"] },
                        "element_id": { "type": "string" }
                    },
                    "required": ["kind", "position", "element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_text",
                "description": "Añade un texto libre al lienzo libre. Solo disponible en modo libre.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Contenido del texto." },
                        "position": { "type": "string", "enum": ["top-left", "top-right", "center", "bottom-left", "bottom-right"] },
                        "element_id": { "type": "string" }
                    },
                    "required": ["text", "position", "element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_note",
                "description": "Añade una nota TipTap al lienzo libre. Solo disponible en modo libre.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": { "type": "string", "description": "Contenido markdown de la nota." },
                        "position": { "type": "string", "enum": ["top-left", "top-right", "center", "bottom-left", "bottom-right"] },
                        "element_id": { "type": "string" }
                    },
                    "required": ["content", "position", "element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_insight",
                "description": "Añade un widget de texto markdown persistente al dashboard.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": { "type": "string", "description": "Contenido markdown del insight." },
                        "title": { "type": "string" },
                        "position": { "type": "string", "enum": ["top-left", "top-right", "top-center", "center", "bottom-left", "bottom-right", "bottom-center"] },
                        "element_id": { "type": "string" }
                    },
                    "required": ["content", "position", "element_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arrange",
                "description": "Reordena o distribuye los elementos del lienzo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": { "type": "string", "enum": ["compact", "spread", "sort_by_type"] }
                    },
                    "required": ["action"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "clear_canvas",
                "description": "Elimina todos los elementos del lienzo. Acción irreversible — usa solo si el usuario lo pide explícitamente.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }),
    ]
}

// Tools de consulta de datos (Admin ve todo; Manager ve subset sin stores_list/users_list).
pub fn data_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "sales_kpis",
                "description": "KPIs de ventas: total, ticket medio, upt, margen, descuento, devoluciones.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": { "type": "string", "enum": ["today", "yesterday", "week", "month", "quarter", "year"] },
                        "store_id": { "type": "string" }
                    },
                    "required": ["period"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "sales_by_hour",
                "description": "Ventas agrupadas por hora del día.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "day": { "type": "string", "description": "Fecha YYYY-MM-DD. Por defecto hoy." },
                        "store_id": { "type": "string" }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "sales_by_family",
                "description": "Ventas desglosadas por familia de producto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": { "type": "string", "enum": ["today", "yesterday", "week", "month", "quarter", "year"] },
                        "store_id": { "type": "string" }
                    },
                    "required": ["period"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "product_rankings",
                "description": "Ranking de productos por ventas, margen o rotación.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rank_by": { "type": "string", "enum": ["sales", "margin", "rotation"] },
                        "period": { "type": "string", "enum": ["today", "yesterday", "week", "month", "quarter", "year"] },
                        "store_id": { "type": "string" },
                        "limit": { "type": "integer", "default": 10, "maximum": 50 }
                    },
                    "required": ["rank_by", "period", "store_id"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "stock_alerts",
                "description": "Alertas de stock: productos agotados o con stock bajo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "store_id": { "type": "string" },
                        "include_expiring": { "type": "boolean", "default": false }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "purchase_orders",
                "description": "Pedidos de compra pendientes y su estado.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": { "type": "string", "enum": ["pending", "received", "all"], "default": "pending" },
                        "limit": { "type": "integer", "default": 20 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "sales_by_employee",
                "description": "Ventas y descuentos desglosados por empleado.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": { "type": "string", "enum": ["today", "yesterday", "week", "month", "quarter", "year"] },
                        "store_id": { "type": "string" }
                    },
                    "required": ["period"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "time_clock_today",
                "description": "Fichajes del día: entradas y salidas por empleado.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "store_id": { "type": "string" },
                        "user_id": { "type": "string" }
                    },
                    "required": ["store_id"]
                }
            }
        }),
    ]
}

// Tools que requieren rol Admin (no se ofrecen a Manager).
pub fn admin_only_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "stores_list",
                "description": "Lista todas las tiendas de la organización.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "active_only": { "type": "boolean", "default": true }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "users_list",
                "description": "Lista los usuarios de la organización (sin emails ni hashes).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "role": { "type": "string", "enum": ["all", "admin", "manager", "cashier"], "default": "all" }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "supplier_prices_comparison",
                "description": "Comparativa de precios de proveedores para un producto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": { "type": "string" }
                    },
                    "required": ["product_id"]
                }
            }
        }),
    ]
}

// Tools de pantalla: NO modifican datos ni el lienzo. El backend las reenvía al frontend como
// evento `view_action` (igual que las canvas ops) para que actúe sobre la vista actual del
// backoffice (scroll + resaltado, o filtrar el listado). Solo se ofrecen fuera del dashboard.
pub fn view_action_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "highlight_on_view",
                "description": "Localiza en la pantalla actual el elemento, sección, columna o dato cuyo texto o rótulo coincide con `target`, hace scroll hasta él y lo resalta unos segundos. Úsalo cuando el usuario pregunte dónde está algo o te pida que se lo señales (p. ej. «¿dónde veo el SKU?», «enséñame el botón de exportar»).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target": { "type": "string", "description": "Texto o rótulo visible a localizar (nombre de columna, botón, sección, KPI, etc.). Usa las mismas palabras que aparecen en pantalla." }
                    },
                    "required": ["target"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "filter_view",
                "description": "Escribe `query` en el buscador de la vista actual para filtrar el listado (por nombre, SKU, código, etc.). Úsalo cuando el usuario pida ver u ocultar filas según un texto. No sirve para cambiar de vista ni para filtros que no sean el buscador de texto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Texto a escribir en el buscador. Cadena vacía para limpiar el filtro." }
                    },
                    "required": ["query"]
                }
            }
        }),
    ]
}

pub fn all_tools_for_admin() -> Vec<Value> {
    let mut tools = canvas_tools();
    tools.extend(data_tools());
    tools.extend(admin_only_tools());
    tools
}

pub fn all_tools_for_manager() -> Vec<Value> {
    let mut tools = canvas_tools();
    tools.extend(data_tools());
    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn tool_names(tools: &[Value]) -> HashSet<String> {
        tools
            .iter()
            .map(|t| t["function"]["name"].as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn toda_tool_tiene_estructura_function_valida() {
        for t in all_tools_for_admin() {
            assert_eq!(t["type"], "function", "tool sin type=function: {t}");
            let f = &t["function"];
            assert!(f["name"].is_string(), "tool sin name: {t}");
            assert!(f["description"].is_string(), "tool sin description: {t}");
            assert_eq!(
                f["parameters"]["type"], "object",
                "parameters.type debe ser object: {t}"
            );
        }
    }

    #[test]
    fn nombres_de_tool_son_unicos() {
        let tools = all_tools_for_admin();
        let names = tool_names(&tools);
        assert_eq!(
            names.len(),
            tools.len(),
            "hay nombres de tool duplicados en el catálogo admin"
        );
    }

    #[test]
    fn admin_ofrece_las_tools_admin_only() {
        let admin = tool_names(&all_tools_for_admin());
        for name in ["stores_list", "users_list", "supplier_prices_comparison"] {
            assert!(admin.contains(name), "admin debería ofrecer {name}");
        }
    }

    #[test]
    fn manager_no_ve_tools_admin_only() {
        let manager = tool_names(&all_tools_for_manager());
        for name in ["stores_list", "users_list", "supplier_prices_comparison"] {
            assert!(
                !manager.contains(name),
                "manager NO debería ver {name} (evita 403)"
            );
        }
    }

    #[test]
    fn catalogo_de_manager_es_subconjunto_del_de_admin() {
        let admin = tool_names(&all_tools_for_admin());
        let manager = tool_names(&all_tools_for_manager());
        assert!(
            manager.is_subset(&admin),
            "el catálogo de manager debe ser subconjunto del de admin"
        );
        // La única diferencia son las admin-only.
        assert_eq!(admin.len() - manager.len(), admin_only_tools().len());
    }

    #[test]
    fn canvas_y_data_tools_presentes_para_ambos_roles() {
        let manager = tool_names(&all_tools_for_manager());
        // Canvas
        for name in ["add_widget", "remove_element", "clear_canvas"] {
            assert!(manager.contains(name), "falta canvas tool {name}");
        }
        // Data
        for name in ["sales_kpis", "product_rankings", "stock_alerts"] {
            assert!(manager.contains(name), "falta data tool {name}");
        }
    }

    #[test]
    fn add_ops_inversibles_requieren_element_id_para_deshacer() {
        // Sin element_id el frontend no puede invertir el add_* al editar/regenerar.
        let canvas = canvas_tools();
        for name in [
            "add_widget",
            "add_shape",
            "add_text",
            "add_note",
            "add_insight",
        ] {
            let tool = canvas
                .iter()
                .find(|t| t["function"]["name"] == name)
                .unwrap_or_else(|| panic!("falta canvas tool {name}"));
            let required = tool["function"]["parameters"]["required"]
                .as_array()
                .unwrap();
            assert!(
                required.iter().any(|v| v == "element_id"),
                "{name} debe requerir element_id"
            );
        }
    }

    #[test]
    fn add_widget_acepta_posiciones_semanticas() {
        let canvas = canvas_tools();
        let add_widget = canvas
            .iter()
            .find(|t| t["function"]["name"] == "add_widget")
            .unwrap();
        let positions = add_widget["function"]["parameters"]["properties"]["position"]["enum"]
            .as_array()
            .unwrap();
        // El frontend traduce estas etiquetas a coords; deben incluir las esquinas y el centro.
        for p in ["top-left", "center", "bottom-right"] {
            assert!(
                positions.iter().any(|v| v == p),
                "add_widget.position debería incluir {p}"
            );
        }
    }

    #[test]
    fn add_widget_retira_el_composite_v1_de_la_superficie() {
        // F6 (#207): el DSL v1 (type/root/composite/endpoint/params/fields/default_size) se RETIRA del
        // schema visible. El agente solo emite block:/gen:panel; la hidratación frontend sigue
        // aceptando layouts v1 ya persistidos, pero el LLM no puede emitirlos.
        let canvas = canvas_tools();
        let add_widget = canvas
            .iter()
            .find(|t| t["function"]["name"] == "add_widget")
            .unwrap();
        let props =
            &add_widget["function"]["parameters"]["properties"]["generic_spec"]["properties"];
        for retired in [
            "type",
            "root",
            "endpoint",
            "params",
            "fields",
            "default_size",
        ] {
            assert!(
                props.get(retired).is_none(),
                "generic_spec.{retired} (v1) NO debe estar en el schema"
            );
        }
        // Solo queda la superficie v2.
        for v2 in ["kind", "recipe", "density", "slots"] {
            assert!(props.get(v2).is_some(), "falta generic_spec.{v2} (v2)");
        }
        // El JSON serializado del schema no menciona 'composite' en ningún sitio.
        let s = serde_json::to_string(&canvas).unwrap();
        assert!(
            !s.contains("composite"),
            "el schema no debe mencionar composite"
        );
    }

    fn enum_strs(v: &Value) -> Vec<String> {
        v.as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn add_widget_expone_dsl_v2_panel() {
        let canvas = canvas_tools();
        let add_widget = canvas
            .iter()
            .find(|t| t["function"]["name"] == "add_widget")
            .unwrap();
        let gs = &add_widget["function"]["parameters"]["properties"]["generic_spec"];
        // kind 'panel'
        assert!(enum_strs(&gs["properties"]["kind"]["enum"]).contains(&"panel".to_string()));
        // recipe enum = RECIPES
        assert_eq!(
            enum_strs(&gs["properties"]["recipe"]["enum"]),
            RECIPES.to_vec()
        );
        // slots.charts.items.piece enum = CHART_PIECES; kpis.items.piece = ['kpiTile']
        let charts_item = &gs["properties"]["slots"]["properties"]["charts"]["items"];
        assert_eq!(
            enum_strs(&charts_item["properties"]["piece"]["enum"]),
            CHART_PIECES.to_vec()
        );
        let kpis_item = &gs["properties"]["slots"]["properties"]["kpis"]["items"];
        assert_eq!(
            enum_strs(&kpis_item["properties"]["piece"]["enum"]),
            KPI_PIECES.to_vec()
        );
        // endpoint enum dentro de una pieza = allowlist; format enum = FORMATS
        assert_eq!(
            enum_strs(&charts_item["properties"]["endpoint"]["enum"]),
            WIDGETABLE_ENDPOINTS.to_vec()
        );
        assert_eq!(
            enum_strs(&charts_item["properties"]["format"]["enum"]),
            FORMATS.to_vec()
        );
    }

    #[test]
    fn add_widget_no_expone_endpoints_de_escritura() {
        // El enum de endpoints de las piezas es solo lectura: ningún POST/PUT/DELETE.
        let s = serde_json::to_string(&canvas_tools()).unwrap();
        for ep in WIDGETABLE_ENDPOINTS {
            assert!(!ep.contains("write") && !ep.contains("delete"));
        }
        assert!(!s.contains("POST") && !s.contains("DELETE"));
    }

    #[test]
    fn pieces_es_la_union_de_los_slots() {
        // PIECES debe ser exactamente kpis ∪ charts (sin huérfanas).
        let mut union: Vec<&str> = KPI_PIECES
            .iter()
            .chain(CHART_PIECES.iter())
            .copied()
            .collect();
        union.sort_unstable();
        let mut all: Vec<&str> = PIECES.to_vec();
        all.sort_unstable();
        assert_eq!(all, union);
    }

    #[test]
    fn el_schema_de_tools_no_se_dispara() {
        // F5 (#206): los enums (piezas/recetas/endpoints/formatos) endurecen el schema vía constrained
        // decoding pero NO deben disparar el tamaño del payload de tools. Cota holgada como guardia.
        // Tamaño actual ~11,5k chars (~2,9k tokens). Cota a 15k = guardia anti-runaway (no doblar).
        let s = serde_json::to_string(&all_tools_for_admin()).unwrap();
        eprintln!("tools_json chars = {}", s.len());
        assert!(
            s.len() < 15_000,
            "el schema de tools creció demasiado: {}",
            s.len()
        );
    }

    #[test]
    fn paridad_vocabulario_con_contrato_compartido() {
        // Fuente única: docs/contracts/dataviz-contract.json. El test gemelo en TS verifica el otro
        // lado; si una copia diverge del contrato, su test falla → no hay drift silencioso (#206).
        let contract: Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/dataviz-contract.json"
        ))
        .expect("contrato JSON válido");
        let strs = |s: &[&str]| s.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        assert_eq!(strs(PIECES), enum_strs(&contract["pieces"]), "pieces");
        assert_eq!(strs(RECIPES), enum_strs(&contract["recipes"]), "recipes");
        assert_eq!(strs(FORMATS), enum_strs(&contract["formats"]), "formats");
        assert_eq!(
            strs(WIDGETABLE_ENDPOINTS),
            enum_strs(&contract["endpoints"]),
            "endpoints"
        );
        let blocks: Vec<String> = BLOCK_IDS
            .iter()
            .map(|b| b.trim_start_matches("block:").to_string())
            .collect();
        assert_eq!(blocks, enum_strs(&contract["blocks"]), "blocks");
    }
}
