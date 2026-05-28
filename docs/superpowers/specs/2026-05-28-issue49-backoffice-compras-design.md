# Spec — Issue #49: Backoffice — proveedores, pedidos, propuesta, recepción

| Campo      | Valor                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                              |
| Estado     | Implementado                                                                            |
| Issue      | [#49](https://github.com/ncara42/simpleTPV/issues/49) — `area:backoffice`, `mvp:week-4` |
| Blocked by | #44, #45, #46 (API de compras)                                                          |

## 1. Objetivo

UI de central para proveedores y pedidos: CRUD, propuesta de pedido, confirmación, recepción y KPIs.

## 2. UI (pestaña Compras, 3 secciones)

- **Pedidos**: lista con estados (badge) y detalle (modal) con líneas, KPIs (fill rate, lead time) y recepción línea a línea. Confirmar DRAFT desde la lista.
- **Proveedores**: alta rápida (nombre + lead time) + lista con eliminar.
- **Propuesta**: selecciona tienda → `POST /purchase-orders/suggest`, muestra las sugerencias con contexto (stock, mínimo, venta media/día, cobertura), permite editar cantidades y crear el pedido con un proveedor.

Reutiliza el cliente `@simpletpv/auth` (nuevos tipos de compras) y `lib/purchases.ts`. React Query + Tailwind/catalog.css.

## 3. Tests

- No rompe los testids/E2E existentes (access.spec 2/2).
- Verificado en navegador (Playwright + API + Postgres): crear proveedor, generar propuesta (2 líneas con contexto real), crear pedido, confirmar, recibir parcial → estado Parcial + fill rate. Sin errores de consola.
