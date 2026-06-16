# Diseño — Flujo de aprobación de movimientos de efectivo con tienda central (#146)

> Estado: **propuesta** (pendiente de visto bueno antes de la migración). Fase 3 de las mejoras del TPV.
> Issues relacionadas: cierra #146. Depende del registro de cierres de caja (#145, Fase 2).

## 1. Contexto y objetivo

Hoy los movimientos de efectivo (`CashMovement` IN/OUT) los crea **directamente** un ADMIN/MANAGER (`POST /cash-sessions/:id/movements`, `@Roles('ADMIN','MANAGER')`). El cajero (CLERK) no puede dispararlos.

El negocio quiere lo contrario: que el **cajero solicite** desde la tienda un ingreso, una retirada o un **traspaso de efectivo a la central**, y que un **ADMIN o MANAGER apruebe o deniegue** desde su dispositivo. El cuadre de caja debe contar **solo los movimientos aprobados**. Los traspasos van **siempre a la tienda “central”**, que se designa en el panel de tiendas del backoffice. Las solicitudes pendientes aparecen en el sistema de **notificaciones (campana)**.

## 2. Decisiones de diseño (D-)

- **D-1 · Tienda central por organización.** `Store.isCentral: Boolean @default(false)`. **Una sola** central por organización, garantizada por un índice único parcial en SQL: `CREATE UNIQUE INDEX one_central_per_org ON "Store"(organizationId) WHERE "isCentral" = true`. Se designa desde el panel de tiendas del backoffice (toggle), con `PATCH /stores/:id/central` que la marca y desmarca la anterior en una transacción.
- **D-2 · Máquina de estados del movimiento.** Nuevo enum `CashMovementStatus { PENDING, APPROVED, DENIED }`. Un movimiento nace `PENDING` (solicitado por el CLERK) y un aprobador lo pasa a `APPROVED` o `DENIED`. Transición única e irreversible (no se re-abre un DENIED; se solicita de nuevo).
- **D-3 · Tipos.** Se añade `TRANSFER_OUT` a `CashMovementType` (junto a `IN`/`OUT`). Semántica: `IN` = ingreso de efectivo en el cajón, `OUT` = retirada, `TRANSFER_OUT` = traspaso a la central (sale del cajón de origen). El traspaso **solo** admite como destino la central → `targetStoreId` apunta a la tienda central; se valida en el servicio.
- **D-4 · Autoría y revisión.** `requestedById` (quién solicita, el `sub` del JWT), `reviewedById?` + `reviewedAt?` (quién y cuándo aprueba/deniega). Se conserva `userId` por compatibilidad de datos = `requestedById` en altas nuevas.
- **D-5 · Aprobadores.** ADMIN **y** MANAGER pueden aprobar/denegar (no solo ADMIN). El MANAGER queda acotado por `assertStoreAccess` a la tienda de origen del movimiento (coherente con SEC-01). El ADMIN, org-wide.
- **D-6 · Cuadre solo con aprobados.** `computeExpected`/`close` agregan únicamente movimientos `APPROVED` (hoy agregan todos). Un `PENDING` no afecta al esperado hasta que se aprueba. Si la caja se cierra con solicitudes `PENDING`, estas se **auto-deniegan** en la transacción de cierre (no pueden aprobarse contra una sesión cerrada; TOCTOU ya cubierto por el lock pesimista RACE-02).
- **D-7 · Notificaciones (campana).** La campana del backoffice agrega hoy fuentes **derivadas** (alertas de stock + lotes por caducar), sin modelo `Notification`. Se añade una **tercera fuente derivada**: movimientos `PENDING` de la organización (`GET /cash-sessions/movements/pending`). El badge suma su conteo y `NotificationsPage` muestra una sección «Aprobaciones de caja» con acciones aprobar/denegar inline. No se introduce un modelo `Notification` (se mantiene el patrón actual).
- **D-8 · Compatibilidad de datos.** La migración pone `status = 'APPROVED'` y `requestedById = userId` en todas las filas existentes (back-fill), para que el cuadre histórico no cambie. `targetStoreId` y `reviewedById/At` quedan `NULL`.

## 3. Cambios de esquema (Prisma + SQL)

```prisma
enum CashMovementType { IN  OUT  TRANSFER_OUT }     // + TRANSFER_OUT
enum CashMovementStatus { PENDING  APPROVED  DENIED } // nuevo

model Store {
  // …
  isCentral Boolean @default(false)
}

model CashMovement {
  // …existentes…
  status         CashMovementStatus @default(PENDING)
  requestedById  String   @db.Uuid
  reviewedById   String?  @db.Uuid
  reviewedAt     DateTime?
  targetStoreId  String?  @db.Uuid   // solo TRANSFER_OUT → central
  // relaciones nuevas: requestedBy, reviewedBy (User), targetStore (Store)
  @@index([organizationId, status, createdAt])      // listar pendientes
}
```

Migración SQL adicional (lo que Prisma no expresa):

- Índice único parcial `one_central_per_org` sobre `Store(organizationId) WHERE isCentral`.
- Back-fill: `UPDATE "CashMovement" SET status='APPROVED', "requestedById"="userId"` (D-8).
- Política RLS `tenant_isolation` ya cubre `CashMovement`/`Store`; las columnas nuevas no necesitan política propia. Verificar `with_check` en el patrón de las demás tablas.

## 4. API

| Método  | Ruta                                      | Rol                       | Acción                                                                                                                                                     |
| ------- | ----------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/cash-sessions/:id/movements/request`    | ADMIN, MANAGER, **CLERK** | Crea movimiento `PENDING` (IN/OUT/TRANSFER_OUT). Para TRANSFER_OUT fija `targetStoreId` = central de la org. `assertStoreAccess` a la tienda de la sesión. |
| `GET`   | `/cash-sessions/movements/pending`        | ADMIN, MANAGER            | Lista movimientos `PENDING` de la org (MANAGER acotado a sus tiendas). Fuente de la campana.                                                               |
| `POST`  | `/cash-sessions/movements/:movId/approve` | ADMIN, MANAGER            | `PENDING→APPROVED` (lock de sesión; rechaza si la sesión no está OPEN).                                                                                    |
| `POST`  | `/cash-sessions/movements/:movId/deny`    | ADMIN, MANAGER            | `PENDING→DENIED`.                                                                                                                                          |
| `PATCH` | `/stores/:id/central`                     | ADMIN                     | Marca la tienda como central (desmarca la anterior en la misma tx).                                                                                        |

El antiguo `POST /cash-sessions/:id/movements` (alta directa ADMIN/MANAGER) se **mantiene** por compatibilidad pero crea el movimiento ya `APPROVED` (un aprobador que actúa en la propia tienda no necesita doble paso). Alternativa a decidir: deprecarlo y forzar el flujo request→approve para todos. **Pregunta abierta P-1.**

## 5. Frontend

### TPV (solicitar)

- En `CashPanel`, el formulario de movimiento pasa a **solicitud**: el CLERK elige tipo (Ingreso / Retirada / **Traspaso a central**), importe y motivo → `POST …/request`. Aviso «Solicitud enviada, pendiente de aprobación». Lista de solicitudes propias con su estado (PENDING/APPROVED/DENIED).
- El selector de tipo muestra «Traspaso a central» solo si existe una central configurada (de `GET /me/stores` ampliado con `isCentral`, o un `GET /me/central`).

### Backoffice (aprobar + configurar central)

- **Panel de tiendas:** toggle «Central» por tienda (radio de una sola activa) → `PATCH /stores/:id/central`. Indicador visual de la central.
- **Notificaciones (campana):** nueva sección «Aprobaciones de caja» con las solicitudes `PENDING` (tienda, tipo, importe, solicitante, motivo) y botones Aprobar/Denegar. El badge de la campana suma estas pendientes a las alertas de stock y caducidad.

### Tipos compartidos (`@simpletpv/auth`)

- `CashMovementType` += `'TRANSFER_OUT'`; nuevo `CashMovementStatus`; ampliar `CashMovement` con `status`, `requestedById`, `reviewedById`, `reviewedAt`, `targetStoreId`; `Store` += `isCentral`. Inputs: `RequestCashMovementInput`.

## 6. Tests

- **API:** request crea PENDING con requestedById; TRANSFER_OUT exige central y fija targetStoreId; approve/deny transicionan y respetan rol+tienda (SEC-01); cuadre cuenta solo APPROVED; cierre auto-deniega PENDING; `one_central_per_org` (integración con Postgres efímero).
- **Frontend:** wiring de los nuevos endpoints; `CashPanel` modo solicitud; sección de aprobaciones en `NotificationsPage`; toggle de central en el panel de tiendas.
- Mantener el **ratchet de cobertura** del API (tests para cada rama nueva del servicio).

## 7. Riesgos y preguntas abiertas

- **P-1 ·** ¿Deprecar el alta directa de movimientos (ADMIN/MANAGER) y forzar request→approve para todos, o mantener el atajo? (propongo mantener como APPROVED directo).
- **P-2 ·** ¿El traspaso a central genera también el movimiento espejo de **entrada** en la caja de la central (TRANSFER_IN), o solo se registra la salida en origen? (propongo solo salida en esta iteración; el ingreso en central se concilia aparte — evitar acoplar dos sesiones de caja).
- **P-3 ·** Notificaciones: ¿basta la fuente derivada (polling + SSE) o se quiere un evento SSE nuevo `cash.movement.requested` para refresco en vivo? (propongo reutilizar el SSE existente con un tipo nuevo).
- **R-1 ·** Migración con back-fill sobre tabla con datos en producción: el `UPDATE` de D-8 debe correr en la misma migración; revisar bloqueos en tablas grandes (CashMovement no debería serlo).
