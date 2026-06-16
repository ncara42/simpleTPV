# Migración del backend a Rust — investigación previa

> **Estado:** fase de **investigación/contexto**. No se implementa código de migración hasta nuevo aviso.
> **Regla de procedencia:** toda la documentación técnica de Rust aquí recogida proviene de **fuentes
> oficiales** vía Context7 (docs.rs / repos oficiales). Lo que **no** pudo confirmarse en Context7 está
> **marcado con 🔶** y debe verificarse contra docs.rs antes de escribir código. Nada se ha "intuido".

## Objetivo

Migrar el backend `apps/api` (NestJS 11 + Prisma + PostgreSQL 16) a Rust de forma quirúrgica,
por fases y con responsabilidades separadas, preservando los invariantes de seguridad
(especialmente el **RLS multi-tenant**) y la corrección contable, con una arquitectura más limpia,
moderna y segura.

## Stack objetivo (resumen)

Tokio · Axum 0.8 · tower-http · SQLx · serde · validator · jsonwebtoken · argon2 · secrecy · config ·
thiserror + anyhow · tracing. Detalle y justificación en `02`.

## Índice

| Doc                                              | Contenido                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [01](01-backend-actual-arquitectura.md)          | Arquitectura del backend NestJS actual (32 módulos, RLS, auth, ~80 rutas)                                                        |
| [02](02-stack-rust-y-fases.md)                   | Stack objetivo, mapeo Nest→Rust, fases, seguridad, riesgos                                                                       |
| [03](03-ref-axum-tower-http.md)                  | Referencia Axum 0.8 + tower-http (web)                                                                                           |
| [04](04-ref-sqlx-rls.md)                         | Referencia SQLx + patrón RLS por tenant (datos)                                                                                  |
| [05](05-ref-tokio.md)                            | Referencia Tokio (runtime async) — con avisos de procedencia 🔶                                                                  |
| [06](06-ref-auth-seguridad.md)                   | Referencia Auth y seguridad (JWT, argon2, validator, secrecy)                                                                    |
| [07](07-ref-serde-errores-tracing.md)            | Referencia serde · errores · tracing · config                                                                                    |
| [08](08-decision-capa-datos.md)                  | Decisión de capa de datos: SQLx vs SeaORM vs Diesel                                                                              |
| [09](09-cambios-upstream-146-caja-aprobacion.md) | Delta upstream PR #146 (caja-aprobación): nuevos invariantes (FOR UPDATE, índice único parcial, afterCommit, transición atómica) |

## Próximos pasos (cuando se dé el "go")

1. Resolver riesgos abiertos de `02 §6` (task_local vs tenant explícito; estrategia de esquema; colas).
2. Segunda ronda Context7: rate limiting, utoipa (OpenAPI), Redis client, SSE en Axum, multipart/CSV.
3. **Fase 0 (spike RLS):** workspace Cargo + función de transacción RLS + portar `rls.integration.spec.ts`. Gate bloqueante.
4. Plan de implementación detallado en `docs/superpowers/plans/`.
