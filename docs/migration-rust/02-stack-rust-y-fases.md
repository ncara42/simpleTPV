# Migración backend a Rust — 02. Stack objetivo, mapeo y fases

> Síntesis de la investigación (toda la doc de crates viene de Context7, fuentes oficiales).
> Estado: **propuesta de contexto**, no se implementa nada hasta nuevo aviso.

---

## 1. Stack objetivo (todo verificado vía Context7 salvo lo marcado 🔶)

| Capa              | NestJS actual             | Rust propuesto                               | Library ID Context7                                   |
| ----------------- | ------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Runtime async     | Node 22 / event loop      | **Tokio**                                    | `/tokio-rs/tokio`                                     |
| Framework web     | NestJS 11 + Express       | **Axum 0.8** + Tower/Hyper                   | `/tokio-rs/axum` (v0.8.4)                             |
| Middleware HTTP   | Helmet, CORS, throttler   | **tower-http**                               | `/tower-rs/tower-http`                                |
| Acceso a datos    | Prisma 6/7                | **SQLx** (ver doc 08)                        | `/websites/rs_sqlx_sqlx`                              |
| Serialización     | class-transformer         | **serde / serde_json**                       | `/websites/serde_rs`                                  |
| Validación        | class-validator           | **validator**                                | `/websites/rs_validator_0_20_0_validator`             |
| JWT               | @nestjs/jwt               | **jsonwebtoken**                             | `/keats/jsonwebtoken`                                 |
| Hash contraseña   | bcryptjs                  | **argon2** (o bcrypt compat)                 | `/websites/rs_argon2_argon2`                          |
| Secretos          | env / dotenv              | **secrecy** + **config**                     | `/websites/rs_secrecy_secrecy`, `/rust-cli/config-rs` |
| Errores           | filtros Nest              | **thiserror** (dominio) + **anyhow** (app)   | `/dtolnay/thiserror`, `/websites/rs_anyhow`           |
| Observabilidad    | logger Nest + Sentry      | **tracing** + **tracing-subscriber**         | `/websites/rs_tracing(-subscriber)`                   |
| Tenant context    | AsyncLocalStorage         | 🔶 **tokio::task_local!** _o_ paso explícito | docs.rs (verificar)                                   |
| Decimal           | Prisma Decimal            | **rust_decimal** (NUMERIC)                   | (en doc SQLx)                                         |
| Colas (VeriFactu) | BullMQ + Redis            | por decidir (Postgres/Redis)                 | —                                                     |
| OpenAPI           | @nestjs/swagger           | por decidir (**utoipa**)                     | — (investigar)                                        |
| Tests             | Vitest + Postgres efímero | `cargo test` + Postgres efímero              | —                                                     |

**Pendiente de investigar en próxima ronda Context7:** rate limiting (`tower_governor`), `utoipa` (OpenAPI), estrategia de colas, generación de structs desde el esquema, multipart/CSV import, SSE en Axum (eventos), Redis client (`redis`/`fred`).

---

## 2. Invariantes que NO se pueden perder

1. **RLS por tenant fail-safe** — sin tenant ⇒ 0 filas; `set_config(..., true)` parametrizado en la misma transacción (doc 04/08).
2. **Aislamiento entre tenants** — verificado por `rls.integration.spec.ts`; portar esos tests es la red de seguridad.
3. **Precisión decimal contable** — `rust_decimal`, nunca float, con los límites `Decimal(10,4)/(12,2)/(10,3)`.
4. **Refresh rotation con detección de reuso** — update atómico condicional, revocar familia ante reuso.
5. **JWT estricto** — un solo algoritmo en whitelist, `exp` validado, `leeway` 0.
6. **JSON camelCase** — `#[serde(rename_all = "camelCase")]` en todos los DTOs (cliente React).
7. **Headers de seguridad y CORS fail-fast** — replicar CSP/HSTS/nosniff y CORS por env.
8. **Idempotencia offline de ventas** (`Sale.clientId` único) y **lock VeriFactu** (`pg_advisory_xact_lock`).
9. **Concurrencia con locks pesimistas** `SELECT ... FOR UPDATE` (TOCTOU del cierre de caja, RACE-02) + **transiciones de estado atómicas condicionales** (`UPDATE ... WHERE status='PENDING'`, comprobar filas afectadas). Ver doc 09 (#146).
10. **Índices únicos parciales** (`one_central_per_org`, `CashSession_one_open_per_store`) — no expresables en Prisma schema, viven en SQL; portar a la estrategia de esquema.
11. **Efectos post-commit best-effort** (`withTenantTx` + `afterCommit`): publicar eventos SSE tras el commit sin acoplar la confirmación de datos. La transacción RLS de Rust debe ofrecer este hook. Ver doc 09.

---

## 3. Arquitectura propuesta (limpia, por capas)

```
crates/ (workspace Cargo dentro del monorepo o repo aparte)
├── app          # bootstrap: main, Router, AppState, config, tracing, graceful shutdown
├── http         # controllers→handlers Axum, extractors, DTOs (serde), mapeo de errores
├── domain       # lógica de negocio pura por módulo (sales, stock, ...), errores thiserror
├── db           # SQLx: pool, repos, transacción RLS (set_config), tipos FromRow
├── auth         # JWT, argon2, guards (FromRequestParts), tenant middleware
└── shared       # tipos comunes, decimal, validación, utilidades
```

Principios: muchos archivos pequeños, alta cohesión; **domain no conoce Axum ni SQLx** (inversión de dependencias); el RLS vive en una única función de `db` reutilizada por todos los repos (un solo punto que auditar).

---

## 4. Fases sugeridas (división de responsabilidades)

> El plan de implementación detallado irá en `docs/superpowers/plans/` cuando se dé el "go".

- **Fase 0 — Fundaciones + spike RLS.** Workspace Cargo, `app` mínima (Axum + Tokio + tracing + config), conexión SQLx, **función de transacción RLS** (equivalente a `withTenantTx`: `set_config(...,true)` + varias queries + soporte `SELECT ... FOR UPDATE` + hook `afterCommit` para efectos post-commit) y portar `rls.integration.spec.ts`. _Gate: los tests de aislamiento de tenant pasan en Rust._ Sin esto, no se continúa.
- **Fase 1 — Auth.** JWT (verify/sign), middleware de tenant + guard de roles (`FromRequestParts`), hashing argon2/bcrypt, refresh rotation. Portar tests de auth.
- **Fase 2 — Núcleo transaccional.** `products`, `stock` (+ lotes), `sales` (+ líneas, idempotencia), `returns`. El corazón del dominio.
- **Fase 3 — Operaciones.** `stores`, `users`, `suppliers`, `purchases`, `transfers`, `cash-sessions`, `z-report`, `time-clock`.
- **Fase 4 — Plataforma.** `dashboard`, `feature-flags`, `api-keys` + `public`, `devices`, `events` (SSE), `organization`, `me`, `promotions`, `product-families`, `b2b`.
- **Fase 5 — Integraciones.** `verifactu` (hash encadenado + colas + reintentos), cache/Redis, observabilidad/Sentry, OpenAPI.
- **Fase 6 — Corte.** Paridad con tests de integración, despliegue (Dockerfile multistage Rust), estrategia de migración (¿big-bang vs strangler por rutas detrás de un proxy?).

Cada fase: TDD (portar tests existentes primero), code review (rust-reviewer + security-reviewer), no avanzar sin tests verdes.

---

## 5. Seguridad (prioridad declarada)

- SQL: siempre bind params (`$1`), nunca interpolar; el `set_config` del RLS incluido.
- JWT: asimétrico (RS256/EdDSA), whitelist de un algoritmo, sin `alg:none`.
- Contraseñas: Argon2id + salt OsRng, verificación en `spawn_blocking`.
- Secretos: `secrecy::SecretBox`, validados al arranque (`config`), nunca en logs (`sensitive_headers`).
- Superficie: `deny_unknown_fields` + `validator`; body limit; rate limiting; CORS/CSP fail-fast.
- Errores: nunca filtrar detalle interno al cliente (`AppError::Internal` → mensaje genérico + `tracing::error!`).
- `unsafe`: prohibido salvo justificación documentada y revisada.
- Auditoría: portar `AuditLog` y mantener logging de login con IP.

---

## 6. Riesgos abiertos (a resolver antes/durante)

1. 🔶 **task_local! vs paso explícito del tenant** — task_local no se hereda en `tokio::spawn`; un olvido = fuga potencial. _Recomendación:_ preferir **pasar `organization_id` explícito** a la capa `db` (o ambos: task_local para ergonomía + assert de coherencia). Decidir en Fase 0.
2. **Estrategia de esquema** — ¿sigue gestionando Prisma Migrate el esquema (tablas/policies/roles) y SQLx solo consume? Probable sí al principio (menos riesgo). Confirmar.
3. **Colas VeriFactu** — sin equivalente BullMQ directo; evaluar cola en Postgres (SKIP LOCKED) vs Redis streams.
4. **Generación de tipos** — escribir structs a mano vs generador; coste de mantenimiento.
5. **Corte en producción** — strangler (proxy enruta rutas migradas a Rust progresivamente) reduce riesgo frente a big-bang.
6. Verificar 🔶 de la doc 05 (Tokio) contra docs.rs antes de codificar.

---

## 7. Documentos de esta carpeta

- `01` Arquitectura del backend actual (lo que migramos).
- `02` (este) Stack, mapeo, fases, seguridad, riesgos.
- `03` Referencia Axum 0.8 + tower-http.
- `04` Referencia SQLx + patrón RLS.
- `05` Referencia Tokio (con avisos de procedencia).
- `06` Referencia Auth y seguridad.
- `07` Referencia serde · errores · tracing · config.
- `08` Decisión de capa de datos (SQLx vs SeaORM vs Diesel).
