use serde_json::{json, Value};

// Catálogo de tools que el LLM puede invocar. Divididas en:
//   - Canvas ops: modifican el lienzo del dashboard.
//   - Data queries: consultan datos de la organización.
// El backend filtra la lista por rol del AuthUser antes de enviarla al LLM.

pub fn canvas_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "add_widget",
                "description": "Añade un widget al dashboard. Usa widgets del catálogo existente o genéricos parametrizables.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "widget_id": {
                            "type": "string",
                            "description": "ID del widget del catálogo (p.ej. 'kpi-today', 'dash-bars') o 'gen:<tipo>' para genérico (tipos: table, bar, line, area, pie, stacked, kpi, insight)."
                        },
                        "position": {
                            "type": "string",
                            "enum": ["top-left", "top-right", "top-center", "center", "bottom-left", "bottom-right", "bottom-center"],
                            "description": "Posición semántica en el lienzo. El frontend traduce a coordenadas reales."
                        },
                        "period": {
                            "type": "string",
                            "enum": ["today", "yesterday", "week", "month", "quarter", "year"],
                            "description": "Periodo de datos. Por defecto 'today'."
                        },
                        "store_id": {
                            "type": "string",
                            "description": "ID de tienda. Si se omite, muestra datos de todas las tiendas."
                        },
                        "element_id": {
                            "type": "string",
                            "description": "ID único del elemento en el lienzo (UUID generado por el agente). Requerido para que el frontend pueda deshacer la operación."
                        },
                        "generic_spec": {
                            "type": "object",
                            "description": "Solo para widgets genéricos (widget_id empieza con 'gen:'). Configura el origen de datos.",
                            "properties": {
                                "type": { "type": "string", "enum": ["table", "bar", "line", "area", "pie", "stacked", "kpi", "insight"] },
                                "endpoint": { "type": "string", "description": "Ruta relativa a /api (solo GET, solo endpoints de la allowlist)." },
                                "params": { "type": "object", "description": "Query params adicionales." },
                                "fields": { "type": "object", "description": "Mapeo campo→etiqueta para columnas/ejes." },
                                "title": { "type": "string" },
                                "default_size": {
                                    "type": "object",
                                    "properties": { "w": { "type": "integer" }, "h": { "type": "integer" } }
                                }
                            },
                            "required": ["type", "endpoint"]
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
                "name": "set_mode",
                "description": "Cambia el modo del dashboard entre cuadrícula y lienzo libre. Pide confirmación al usuario antes de usar esta tool.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mode": { "type": "string", "enum": ["grid", "free"] }
                    },
                    "required": ["mode"]
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
        for name in ["add_widget", "remove_element", "set_mode", "clear_canvas"] {
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
}
