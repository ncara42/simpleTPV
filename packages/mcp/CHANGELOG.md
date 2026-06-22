# Changelog — @simpletpv/mcp

## 1.1.0

### Cambios incompatibles (tools consolidadas)

10 tools de dashboard se han fusionado en 3 tools parametrizadas, para reducir el
número de esquemas en contexto y mejorar la selección del modelo (recomendación de
Anthropic, _"Writing effective tools for agents"_ → consolidar operaciones afines).
Si tienes prompts o automatizaciones que referencian los nombres antiguos, actualízalos:

| Antiguas                                                                                                                      | Nueva                    | Parámetro discriminador                                                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `get_sales_by_store`, `get_sales_by_product_family`, `get_sales_by_hour`, `get_sales_by_employee`, `get_discount_by_employee` | `get_sales_by_dimension` | `dimension`: `store` \| `family` \| `hour` \| `employee` \| `discount_by_employee` |
| `get_sales_kpis`, `get_margin_kpis`, `get_stockout_kpis`                                                                      | `get_kpis`               | `group`: `sales` \| `margin` \| `stockout`                                         |
| `get_product_rotation`, `get_archetype_rotation`                                                                              | `get_rotation`           | `level`: `product` \| `archetype`                                                  |

Total de tools: **38 → 31**.

### Mejoras (compatibles)

- **Salida JSON compacta** (sin indentación) → −25-40 % de tokens en respuestas grandes.
- **Anotaciones de solo-lectura** (`readOnlyHint` / `idempotentHint` / `openWorldHint:false`)
  en todas las tools (spec MCP 2025-06-18) → el cliente puede auto-aprobarlas y paralelizarlas.
- **Tools compuestas** `get_sales_breakdown` y `get_inventory_health` (fan-out server-side
  con `Promise.all`) → convierten N round-trips en 1 para las preguntas analíticas habituales.
- **Caps por defecto** cuando se omite `limit`: `list_sales`/`list_returns` (50),
  `list_products`/`get_stock_movements` (100); override libre.

## 1.0.0

- Versión inicial: 36 tools de solo-lectura sobre la API de SimpleTPV.
- Transporte stdio (credenciales por entorno) + servidor HTTP OAuth 2.1 multi-tenant.
