# Spec — Issue #44: Compras base (Supplier/PurchaseOrder) + CRUD y estados

| Campo      | Valor                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                  |
| Estado     | Implementado                                                                                |
| Issue      | [#44](https://github.com/ncara42/simpleTPV/issues/44) — `area:api`, `area:db`, `mvp:week-4` |
| Blocked by | #27 (stock base, para recepción posterior)                                                  |

## 1. Objetivo

Issue base de la semana 4: proveedores y pedidos a proveedor con su máquina de estados. La propuesta (#45), recepción (#46) y KPIs cuelgan de esto.

## 2. Datos

- `Supplier` (name, nif?, email?, phone?, leadTimeDays Int default 7, active). RLS.
- `PurchaseOrder` (supplierId, storeId destino, status `PurchaseOrderStatus` default DRAFT, notes?, createdBy, confirmedAt?, receivedAt?). Índice `[organizationId, status, createdAt]`. RLS.
- `PurchaseOrderLine` (purchaseOrderId, productId, quantityOrdered, quantityReceived default 0, unitCost?). RLS propia.
- `enum PurchaseOrderStatus { DRAFT CONFIRMED PARTIALLY_RECEIVED RECEIVED }`.

## 3. API

- `suppliers`: CRUD `/suppliers`. Lectura cualquier rol; escritura ADMIN/MANAGER. RLS + organizationId explícito.
- `purchases`:
  - `POST /purchase-orders` (DRAFT con líneas; valida proveedor y tienda del tenant) — ADMIN/MANAGER.
  - `GET /purchase-orders?status=`, `GET /purchase-orders/:id` — cualquier rol.
  - `POST /purchase-orders/:id/confirm` (DRAFT → CONFIRMED) — ADMIN/MANAGER. Transición atómica condicional al estado (`updateMany`, como traspasos #31).

## 4. Tests

- Unit: SuppliersService (CRUD, 404, aislamiento); PurchasesService (create validaciones, confirm transición/carrera, list/get); controllers (delegación).
- Integración (`purchases.integration.spec.ts`): CRUD de proveedor aislado por tenant; crear+confirmar pedido; doble confirmación rechazada; pedido con proveedor de otra org rechazado.
