# Spec — Issue #12: Anulación de venta (void)

| Campo      | Valor                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                   |
| Estado     | Aprobado para implementación                                                                 |
| Issue      | [#12](https://github.com/ncara42/simpleTPV/issues/12) — `area:api`, `area:tpv`, `mvp:week-2` |
| Blocked by | #8 ✅                                                                                        |

## 1. Objetivo

Anular una venta completa: `POST /sales/:id/void` marca la venta como anulada (rol MANAGER/ADMIN), queda auditada y aislada por tenant. Acción mínima en el TPV.

## 2. Datos

`enum SaleStatus { COMPLETED VOIDED }`.

`Sale` añade:

- `status SaleStatus @default(COMPLETED)`.
- `voidedAt DateTime?` y `voidedBy String? @db.Uuid` (usuario que anuló, para trazabilidad).

Migración aditiva: crea el enum, añade `status` con DEFAULT 'COMPLETED' (filas existentes quedan COMPLETED), `voidedAt`/`voidedBy` nullable. Sin RLS nuevo.

## 3. API

`POST /sales/:id/void` (`@Roles('ADMIN','MANAGER')` — un CLERK recibe 403 por el RolesGuard global):

- `voidSale(id, userId)` en el servicio. Filtra por `organizationId` (defensa en profundidad + RLS):
  - Carga la venta (`findFirst({ where: { id, organizationId } })`). Si no existe → 404.
  - Si ya está `VOIDED` → `BadRequestException` ("La venta ya está anulada").
  - `update` a `status: VOIDED`, `voidedAt: now`, `voidedBy: userId`.
  - Restauración de stock: `// TODO: stock semana 3` (no-op).
- El `AuditInterceptor` global ya registra la mutación (POST) en `audit_logs` — no hay que hacer nada extra, pero verificar que el método es POST (lo es).
- Devuelve la venta actualizada.

`@HttpCode(200)` (es una mutación sobre recurso existente, no creación).

## 4. "No cuenta en totales"

El AC pide que la venta anulada no cuente en totales. En esta issue no hay endpoint de totales/historial todavía (es #14). Lo que garantizamos aquí: la venta queda marcada `VOIDED` de forma que el historial (#14) y cualquier agregado **DEBE filtrar `status = COMPLETED`**. Se documenta y se deja preparado; el historial lo respetará.

## 5. TPV

- `lib/sales.ts`: `voidSale(id)` → `api.post('/sales/:id/void')`. Tipo `Sale` ya tiene status (añadir a api-types).
- En la pantalla de confirmación post-venta (CartPanel, estado `confirmed` con el ticket): botón **"Anular venta"** visible solo si el rol del usuario es ADMIN/MANAGER (usar `getRole()` del auth store — solo-UI; el backend es la autoridad real). Al anular → confirmación visual ("Venta anulada") y permite "Nueva venta". Si el usuario es CLERK, el botón no aparece (y aunque apareciera, el backend devuelve 403).
- Manejo de error (403/400) con mensaje.

## 6. Tests

- Unit: la lógica de transición (no se puede anular una ya anulada) si se extrae; si no, cubrir en integración.
- Integración: `voidSale` marca VOIDED; anular dos veces → error; un id inexistente → 404; aislamiento (no se puede anular venta de otra org); el rol se valida en el controller (el RolesGuard rechaza CLERK con 403 — verificable a nivel HTTP o documentar que es responsabilidad del guard global ya testeado).
