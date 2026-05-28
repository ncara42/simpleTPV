# Spec — Issue #48: Swagger/OpenAPI + exportación de pedido CSV

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado                                                                     |
| Issue      | [#48](https://github.com/ncara42/simpleTPV/issues/48) — `area:api`, `mvp:week-4` |
| Blocked by | #44 (pedidos)                                                                    |

## 1. Swagger/OpenAPI

`@nestjs/swagger` con `DocumentBuilder` (título, descripción, versión, `addBearerAuth`). UI servida en `docs` (`SwaggerModule.setup('docs', ...)`); tras el proxy de los frontends queda en `/api/docs`. El documento OpenAPI tiene 47 paths (todos los controladores). Auth Bearer documentada.

## 2. Exportación CSV

`GET /purchase-orders/:id/export` — ADMIN/MANAGER, `Content-Type: text/csv`. `PurchasesService.exportCsv(id)` genera: cabecera `producto,cantidad_pedida,cantidad_recibida,coste_unitario` + una fila por línea, resolviendo el nombre del producto y escapando comas/comillas. PDF queda como TODO (evita dependencia pesada).

## 3. Tests

- Unit: `exportCsv` (cabecera + filas, escape de comas, coste vacío); controller delega.
- Integración: export CSV con nombre de producto real.
- Smoke verificado: `/docs` responde 200 y `/docs-json` tiene 47 paths.
