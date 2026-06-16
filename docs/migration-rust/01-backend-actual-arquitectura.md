# Migración backend a Rust — 01. Arquitectura del backend actual

> Documento de **contexto/investigación** (no es código ni plan de implementación todavía).
> Estado: borrador inicial · Fecha: 2026-06-16 · Rama: `fix/sec-115-deploy-failfast`
> Fuente: exploración directa de `apps/api` (NestJS 11 + Prisma + PostgreSQL 16).

Este documento captura **el sistema que vamos a migrar**, para que el diseño en Rust
preserve invariantes (especialmente seguridad y multi-tenancy) en lugar de reinventarlos.

---

## 1. Visión general

Backend **monolítico REST** bien estructurado:

- **Stack:** NestJS 11 + Prisma + PostgreSQL 16, TypeScript, Node 22.
- **~250 archivos `.ts`**, ~12.000–15.000 líneas, **32 módulos temáticos**.
- **~80+ rutas HTTP**.
- **Multi-tenancy** por **Row Level Security (RLS) de PostgreSQL** + `AsyncLocalStorage` + Prisma `$extends`.
- **Seguridad en profundidad:** JWT con rotación de refresh, mitigación de timing attacks, audit log, rate limiting, RLS por tenant, API keys.
- Integración fiscal **VeriFactu** (cola BullMQ, hash encadenado, reintentos), Redis con degradación.

---

## 2. Módulos NestJS (responsabilidades)

| Módulo               | Responsabilidad                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **auth**             | JWT, refresh token rotation, roles/guards, revalidación de estado de usuario                   |
| **sales**            | Ventas (crear/anular), historial, exportación contable, recibo fiscal, integración VeriFactu   |
| **stock**            | Stock por tienda/global, alertas de mínimos, lotes con vencimiento (trazabilidad), movimientos |
| **products**         | Catálogo, búsqueda, import CSV, familias, precios por tienda                                   |
| **purchases**        | Órdenes de compra, recepción con lotes/vencimientos                                            |
| **returns**          | Devoluciones contra venta, autorización por PIN, reversión de stock                            |
| **transfers**        | Traspasos entre tiendas, estado, historial                                                     |
| **stores**           | Tiendas, estado operativo, precios por tienda                                                  |
| **suppliers**        | Proveedores, tarifas de compra                                                                 |
| **users**            | Usuarios, roles (ADMIN/MANAGER/CLERK), tiendas asignadas, preferencias                         |
| **organization**     | Datos de organización (tenant raíz), branding                                                  |
| **cash-sessions**    | Sesiones de caja, movimientos de efectivo, cierre                                              |
| **z-report**         | Reportes Z (cierre diario)                                                                     |
| **devices**          | Dispositivos TPV registrados, estado                                                           |
| **verifactu**        | Integración fiscal AEAT, hash, QR, cola de reintentos                                          |
| **dashboard**        | Métricas agregadas (ventas, ingresos, top productos, por hora)                                 |
| **feature-flags**    | Flags por tienda                                                                               |
| **api-keys**         | Generación/revocación de keys de API pública                                                   |
| **public**           | API pública de stock (read-only, `X-API-Key`)                                                  |
| **events**           | Bus de eventos (SSE en tiempo real)                                                            |
| **cache**            | Abstracción cache (Redis o memoria, fallback automático)                                       |
| **prisma**           | `PrismaService` con RLS, tenant context, transacciones                                         |
| **common**           | Filtros, pipes, decoradores, límites numéricos                                                 |
| **config**           | Seguridad, CORS, rate limiting, proxy trust                                                    |
| **health**           | Liveness/readiness                                                                             |
| **observability**    | Sentry                                                                                         |
| **me**               | Perfil del usuario actual                                                                      |
| **b2b**              | Órdenes mayoristas (wholesale)                                                                 |
| **time-clock**       | Control horario de empleados                                                                   |
| **product-families** | Taxonomía jerárquica de productos                                                              |
| **promotions**       | Promociones/descuentos                                                                         |

---

## 3. Mecanismo de multi-tenancy (RLS) — INVARIANTE CRÍTICO

Es el punto más delicado de la migración. El backend actual:

1. `TenantContextInterceptor` (global) extrae `organizationId` del JWT (`req.user.organizationId`) y abre un `AsyncLocalStorage` con `{ organizationId }`.
2. Cada operación Prisma pasa por `$extends.query.$allOperations`:
   - Si **no hay contexto** de tenant → ejecuta la query tal cual → RLS sin `current_setting` ⇒ **0 filas (fail-safe)**.
   - Si **hay contexto** → abre `$transaction`, ejecuta dentro:
     ```sql
     SELECT set_config('app.current_organization_id', $1, true)  -- is_local = true (scope transacción)
     ```
     (parametrizado, nunca interpolado) y **re-emite la operación sobre `tx`** (misma conexión, misma transacción).
3. La policy RLS de PostgreSQL filtra cada fila por `current_setting('app.current_organization_id')`.

> **Dos mecanismos de RLS** (importante, ampliado tras PR #146 — ver doc 09):
>
> - `$extends` por-operación (`applyTenantExtension`): una transacción por operación suelta.
> - **`withTenantTx`** (cliente BASE): UNA transacción interactiva con `set_config(...,true)` como
>   primera sentencia, para **escrituras multi-tabla atómicas** + locks `SELECT ... FOR UPDATE` +
>   hook `afterCommit` (efectos post-commit best-effort, p.ej. eventos SSE). Es el patrón de
>   referencia para la capa de datos en Rust (doc 04).

**Implicaciones para Rust:**

- Necesitamos un equivalente a `AsyncLocalStorage` → **`tokio::task_local!`** (a investigar/confirmar en doc oficial).
- Necesitamos control fino: **fijar una conexión concreta del pool**, ejecutar `set_config(..., true)` parametrizado al inicio de una transacción y reusar esa misma transacción para el resto de queries del request → favorece **SQLx** (control explícito de `Transaction`/`acquire`).
- Mantener el **fail-safe**: sin tenant ⇒ 0 filas, nunca fuga entre tenants.
- La contraseña del rol `app` NO va en migraciones (decisión de seguridad previa; ver `packages/db/scripts/README.md`).

---

## 4. Autenticación / Autorización

### Flujo

- `POST /auth/login` (email+password) → `{ accessToken, refreshToken }`.
- **Access token** ~15 min; **refresh token** ~7 días (cookie httpOnly, Secure en prod, SameSite=strict).
- **Refresh rotation (SEC-06):** cada refresh marca atómicamente el `jti` como usado (`UPDATE ... WHERE usedAt IS NULL`); reuso detectado ⇒ revoca toda la **familia** de tokens (defensa anti-robo). Maneja carreras.
- **Logout:** revoca toda la familia.

### JWT payload

```
{ sub: userId, organizationId, role, iat, exp }
```

`organizationId` viaja **dentro** del token (no hay header `X-Org-Id`).

### Guards / Interceptores globales (orden importa)

- Guards: `TestAwareThrottlerGuard` (rate limit) → `AuthGuard` (verifica JWT, puebla `req.user`, revalida usuario activo/rol — A-04) → `RolesGuard` (`@Roles(...)`).
- Interceptores: `TenantContextInterceptor` (abre ALS de tenant) → `AuditInterceptor` (registra mutaciones en `AuditLog`, best-effort).
- `@Public()` salta auth. `SEC-01`: CLERK solo opera en tiendas asignadas; MANAGER/ADMIN en cualquiera.

### Hashing

- Contraseñas con **bcrypt** (`bcryptjs`). Mitigación de timing attack en login (compara contra hash dummy si el usuario no existe — SEC-14).
- PIN de empleado hasheado (`pinHash`).

---

## 5. Características transversales

- **Validación:** `class-validator` + `class-transformer` sobre DTOs; `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform`. Límites numéricos por precisión decimal contable.
- **Errores:** `PrismaExceptionFilter` global mapea P2002→409, P2003→409, P2025→404, resto→500.
- **Rate limiting:** `@nestjs/throttler` global (120/min por defecto) + específicos (`/auth/login` 5/min, `/public/stock` 30/min).
- **Security headers:** Helmet con CSP estricta en prod (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`).
- **CORS:** orígenes por env (`CORS_ORIGINS`), `credentials: true`; fail-fast en prod si no configurado.
- **Body limit:** JSON 512kb; arrays de líneas acotados (`@ArrayMaxSize(200)`).
- **Cache/Redis:** abstracción con fallback a memoria; degradación si Redis cae (no tumba la API).
- **Colas:** BullMQ (Redis) para reintentos VeriFactu; modo síncrono sin Redis.
- **Logging:** logger Nest + auditoría de login (IP) + Sentry en prod.

### Precisión decimal (contable) — INVARIANTE

```
MAX_PRICE    = 999999.9999      // Decimal(10,4)
MAX_AMOUNT   = 9999999999.99    // Decimal(12,2)
MAX_QUANTITY = 999999.999       // Decimal(10,3)
```

En Rust ⇒ `rust_decimal` / `BigDecimal` (a confirmar mapeo con SQLx, ver doc datos). **Nunca `f64` para dinero.**

---

## 6. Modelos de datos principales (Prisma)

Tenant raíz **Organization**; casi todos los modelos llevan `organizationId` (eje de RLS).
Núcleo: `Store`, `User`, `UserStore` (M2M), `Product`, `ProductFamily` (árbol autorreferencial),
`Sale` + `SaleLine` (con campos congelados: `taxRate`, `costPrice`, `discountSource`),
`Return` + `ReturnLine`, `Stock`, `StockBatch` (lotes/caducidad), `StockMovement`, `StockAlert`,
`Transfer`/`TransferLine`, `PurchaseOrder`/`PurchaseOrderLine`, `Supplier`/`SupplierPrice`,
`CashSession`/`CashMovement`, `VerifactuRecord` (hash encadenado), `AuditLog`,
`RefreshToken` (jti+familyId), `UserPreference`, `StorePrice`, `PriceList`/`PriceListItem`,
`ApiKey`, `FeatureFlag`, `OfficialDevice`, `TimeClockEntry`, `SalesExport`.

Idempotencia offline: `Sale.clientId` único por organización.
Concurrencia VeriFactu: `pg_advisory_xact_lock(hash(organizationId))` antes de encadenar hash.

---

## 7. Integraciones externas

- **VeriFactu (AEAT, fiscal España):** dentro de la TX de la venta computa hash encadenado + QR e inserta `VerifactuRecord (PENDING)`; post-commit encola envío; worker reintenta (máx 5) → SENT/FAILED. Endpoints de control `GET /verifactu/records`, `POST /verifactu/records/:id/retry`.
  - Nota de negocio: VeriFactu **no urgente** (obligatorio 1-ene-2027 Sociedades / 1-jul-2027 resto).
- **Email / Pagos:** `PaymentMethod` enum en `Sale` (CASH/CARD/...), sin integración de pasarela explícita observada.

---

## 8. Tests

- **Vitest** (unit + integration). Integration con **Postgres efímero** (no se mockea la BD — exigido por convención del repo).
- ~90 archivos `.spec.ts`. RLS verificado en `apps/api/test/rls.integration.spec.ts`.
- Gate de cobertura mide solo unit tests; código integration-only no cuenta (ver memoria CI coverage ratchet).

---

## 9. Riesgos/atención para la migración a Rust

1. **RLS:** no hay equivalente directo a `$extends`. Replicar con middleware + `task_local!` + transacción SQLx fijando conexión y `set_config(..., true)` parametrizado. Mantener fail-safe.
2. **Precisión decimal contable:** tipos decimales exactos, nunca float.
3. **Refresh rotation con carreras:** update atómico condicional + detección de reuso → revocar familia.
4. **Colas/Redis:** sustituir BullMQ (decidir crate/estrategia; posible Postgres-based o Redis streams).
5. **Validación:** `class-validator` → `validator` crate + extractor que valide DTOs deserializados por serde.
6. **JSON camelCase:** el cliente React espera camelCase ⇒ `#[serde(rename_all = "camelCase")]` en todos los DTOs de salida.
7. **OpenAPI/Swagger:** evaluar `utoipa` para no perder documentación de API.
8. **Paridad de comportamiento:** los tests de integración actuales (Postgres efímero) son la red de seguridad para validar paridad.

---

> Continúa en `02-stack-rust-fuentes-oficiales.md` (documentación oficial de las crates objetivo, recogida vía Context7).
