# Migración backend a Rust — 09. Delta upstream: PR #146 (caja-aprobación)

> Cambios de `marcogmurciano` (commit `15772d8`, 16-jun-2026) y su impacto en la migración.
> **ESTADO (actualizado):** **YA FUSIONADO en `main`**. Marco lo mergeó en su `upstream/main`
> vía su PR #151; ncara42 lo sincronizó a `origin/main` vía PR #155 (+ merge `c36b7b6`). El
> commit `15772d8` es ancestro de `origin/main` y del `main` local (actualizado a `c36b7b6`).
> ⇒ La migración a Rust debe tomar como base `origin/main` (que YA incluye este #146).
> (Nota: hubo una ventana en la que la rama estaba sin fusionar; ya no es el caso.)

## Qué hace (#146)

Flujo de **aprobación de movimientos de efectivo** + **tienda central**:

- El **CLERK solicita** (ingreso/retirada/traspaso) desde el TPV → movimiento `PENDING`.
- Un **ADMIN/MANAGER aprueba o deniega** desde la campana del backoffice.
- El **cuadre cuenta solo `APPROVED`**; al cerrar la caja, los `PENDING` se **auto-deniegan**.
- Los **traspasos (`TRANSFER_OUT`) van siempre a la tienda central** de la organización.

## Cambios de modelo de datos (afectan a doc 01)

Migración `20260616130000_cash_movement_approval`:

- **enum nuevo** `CashMovementStatus { PENDING, APPROVED, DENIED }`.
- **`CashMovementType` += `TRANSFER_OUT`** (junto a `IN`/`OUT`).
- **`Store.isCentral Boolean @default(false)`**.
- **`CashMovement`** += `status`, `requestedById` (NOT NULL), `reviewedById?`, `reviewedAt?`, `targetStoreId?` (→ central, solo `TRANSFER_OUT`); FKs a `User`/`Store`; índice `(organizationId, status, createdAt)`.
- **back-fill (D-8):** filas previas → `status='APPROVED'`, `requestedById = userId` (cuadre histórico intacto).
- **índice único parcial** `one_central_per_org`: `CREATE UNIQUE INDEX ... ON "Store"(organizationId) WHERE "isCentral" = true` (una sola central por org).

## Invariantes NUEVOS que la migración a Rust debe replicar

Estos patrones ya existían en el código pero el #146 los usa intensamente; conviene fijarlos como requisitos de la capa de datos en Rust (SQLx):

1. **Lock pesimista `SELECT ... FOR UPDATE`** sobre la fila de la sesión antes de leer su estado y mutar (TOCTOU "RACE-02"). En SQLx:

   ```rust
   sqlx::query("SELECT id FROM \"CashSession\" WHERE id = $1 FOR UPDATE")
       .bind(session_id).execute(&mut *tx).await?;
   // releer estado y mutar en la MISMA tx
   ```

   Se usa en `createMovement`, `requestMovement`, `approveMovement` y `close`.

2. **Transición de estado atómica condicional** (no dos aprobadores duplicando):

   ```sql
   UPDATE "CashMovement" SET status='APPROVED', "reviewedById"=$u, "reviewedAt"=now()
   WHERE id=$m AND "organizationId"=$org AND status='PENDING'
   ```

   En Rust: comprobar `rows_affected() == 0` ⇒ "ya no está pendiente" → 400. (Equivalente al `updateMany` condicional + `count===0`.)

3. **Índice único parcial** (`one_central_per_org`): Prisma no lo expresa en el schema; vive en SQL. Si en Rust se gestiona el esquema con SQLx migrations habría que portarlo a SQL crudo. Estrategia de "desmarcar la anterior antes de marcar la nueva, en una sola tx" (`setCentral`) para no chocar con el índice.

4. **Efectos post-commit best-effort (`afterCommit`)** — el patrón `withTenantTx(base, org, (tx, afterCommit) => {...})` ejecuta el `set_config(..., true)` LOCAL en una transacción interactiva y, **tras el commit**, lanza callbacks que NO revierten la operación si fallan (p.ej. publicar `cash.movement.requested` en el bus SSE). En Rust:

   ```rust
   // 1) tx con set_config + lógica → commit
   // 2) DESPUÉS del commit, efectos best-effort (event bus), errores tragados
   ```

   Es la forma correcta de no acoplar la confirmación de datos a la publicación de eventos. Modelar como un wrapper equivalente sobre la transacción RLS de SQLx.

5. **Evento nuevo en el bus SSE:** `cash.movement.requested` (junto a `stock.changed`, `sale.completed`, `alert.created`). La capa de eventos/SSE en Rust (a investigar: SSE en Axum) debe contemplar este tipo.

## Aclaración importante sobre el RLS (corrige doc 01/04)

El código tiene **DOS** mecanismos de RLS, no solo el `$extends` por-operación:

- **`$extends` por-operación** (`applyTenantExtension`): abre una transacción por cada operación Prisma suelta y fija `set_config`. Bien para lecturas/escrituras simples.
- **`withTenantTx`** (cliente BASE, sin extensión): UNA transacción interactiva con `set_config('app.current_organization_id', $org, true)` como primera sentencia, para **escrituras multi-tabla atómicas** (cierre de caja, aprobaciones, `setCentral`). Es el patrón que mejor mapea a la transacción RLS de **SQLx** descrita en doc 04 — **debe ser el modelo de referencia** para la capa `db` en Rust (un único punto que fija el tenant + permite varias queries + locks + post-commit).

## API nueva (afecta al mapeo de rutas, doc 01/02)

| Método | Ruta                                      | Rol                       |
| ------ | ----------------------------------------- | ------------------------- |
| POST   | `/cash-sessions/:id/movements/request`    | ADMIN, MANAGER, **CLERK** |
| GET    | `/cash-sessions/movements/pending`        | ADMIN, MANAGER            |
| POST   | `/cash-sessions/movements/:movId/approve` | ADMIN, MANAGER            |
| POST   | `/cash-sessions/movements/:movId/deny`    | ADMIN, MANAGER            |
| PATCH  | `/stores/:id/central`                     | ADMIN                     |

`POST /cash-sessions/:id/movements` (alta directa ADMIN/MANAGER) se mantiene pero crea ya `APPROVED`.

## Frontends y tipos compartidos

- `@simpletpv/auth`: `CashMovementStatus`, `TRANSFER_OUT`, `Store.isCentral`, `CashMovement` ampliado, `RequestCashMovementInput`, `PendingCashMovement`, evento nuevo. (La migración del backend debe exponer el mismo contrato JSON camelCase — ver doc 07.)
- TPV: `CashPanel` modo solicitud + `CashMovementRow`. Backoffice: toggle central + sección "Aprobaciones de caja" en la campana. (No afectan al backend Rust salvo por el contrato de API.)

## Acciones para la migración

- [ ] Reflejar el nuevo modelo de `CashMovement`/`Store` y la máquina de estados en el diseño de dominio (`domain`).
- [ ] La función de transacción RLS de Fase 0 debe soportar: `FOR UPDATE`, varias queries, y hook `afterCommit`. (Ya alineado con doc 04; este PR lo confirma como requisito firme.)
- [ ] Portar tests de integración nuevos: flujo completo, auto-deny al cerrar, `one_central_per_org`, traspaso a central.
- [ ] Tener en cuenta índices únicos parciales en la estrategia de esquema (doc 02 §6 riesgo 2).
- [ ] SSE en Axum debe soportar `cash.movement.requested`.

## Procedencia

Diseño: `docs/superpowers/specs/2026-06-16-issue146-caja-aprobacion-design.md` (en la rama).
Código: `apps/api/src/cash-sessions/*`, `apps/api/src/stores/stores.service.ts`, `apps/api/src/prisma/with-tenant-tx.ts`, `apps/api/src/events/event-bus.interface.ts`, `packages/db/prisma/{schema.prisma,migrations/20260616130000_cash_movement_approval}`.
