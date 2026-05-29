# Spec — Issue #59: Devolución sin ticket con autorización MANAGER por PIN

| Campo      | Valor                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-29                                                                                              |
| Estado     | Implementado                                                                                            |
| Issue      | [#59](https://github.com/ncara42/simpleTPV/issues/59) — `area:api`, `area:tpv`, `area:db`, `mvp:week-4` |
| Blocked by | #15 (devoluciones), #27 (stock)                                                                         |

## 1. Objetivo

Devolver un producto sin ticket de referencia, con autorización de un MANAGER/ADMIN por PIN. Desgajada de la #50.

## 2. Datos

Migración: `Return.saleId` y `ReturnLine.saleLineId` pasan a **opcionales** (NULL en devoluciones sin ticket); FKs recreadas con `ON DELETE SET NULL`. Nueva columna `Return.authorizedBy` (UUID del MANAGER/ADMIN que autorizó). RLS intacta.

## 3. Decisiones (triage)

- **D59-1 — Importe = precio actual del catálogo × qty.** Sin ticket no se sabe a qué venta pertenece ni a qué precio se vendió; se usa el `salePrice` vigente del producto. Estándar en retail. Confirmado.
- **D59-2 — Autorizan MANAGER o ADMIN** por PIN (el operario puede ser CLERK).
- **D59-3 — Endpoint nuevo** `POST /returns/blind` (separado del contra-ticket).

## 4. API

`POST /returns/blind` `{ storeId, reason, managerPin, lines: [{ productId, qty }] }` — cualquier rol inicia, pero `resolveAuthorizer` valida el PIN contra los `pinHash` (bcrypt) de los MANAGER/ADMIN activos del tenant; sin match → **403**. El servicio calcula el importe (precio actual × qty), crea el Return sin saleId con `authorizedBy`, y repone el stock (`applyMovement` RETURN) en una tx atómica.

## 5. TPV

Vista Devolución con toggle **Con ticket / Sin ticket**. El panel sin ticket: buscar producto, cantidad, motivo obligatorio, PIN de autorización, confirmar. Maneja el 403 (PIN inválido) con un mensaje claro.

## 6. Tests

- Unit: `resolveAuthorizer` (403 sin match), `createBlind` (importe = precio×qty, authorizedBy, 400 producto ajeno, repone stock RETURN); controller delega.
- Integración: PIN inválido → 403; PIN válido repone stock; no rompe la devolución contra ticket (#15).
- Verificado en navegador: flujo completo (búsqueda, PIN inválido→error, PIN válido→devolución 59,80 €). E2E TPV 8/8 intactos.
