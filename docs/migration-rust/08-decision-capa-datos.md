# Migración backend a Rust — 08. Decisión de capa de datos (SQLx vs SeaORM vs Diesel)

> Comparativa basada en documentación **oficial** vía Context7. El requisito que decide es el
> **RLS multi-tenant** (`set_config('app.current_organization_id', $tenant, true)` por transacción).

---

## Requisito que manda

La capa de datos debe permitir, por request:

1. Adquirir una **conexión concreta** del pool y no soltarla entre pasos.
2. Ejecutar `set_config(..., true)` **parametrizado** (sin interpolar el tenant).
3. Reusar **esa misma conexión/transacción** para todas las queries del request.
4. Mantener el **fail-safe**: sin tenant ⇒ 0 filas.

---

## SQLx (`/websites/rs_sqlx_sqlx`)

```rust
let mut conn = pool.acquire().await?;                       // conexión explícita
sqlx::query("SELECT set_config('app.current_organization_id', $1, true)")
    .bind(&tenant_id).execute(&mut *conn).await?;           // bind param, sin interpolación
let mut tx = conn.begin().await?;                           // misma conexión
sqlx::query("INSERT INTO orders ...").execute(&mut *tx).await?;
tx.commit().await?;
```

✅ Control de conexión directo, `set_config` con `$1`, sin ORM que genere queries fuera de control. Macros `query!`/`query_as!` verifican SQL en compilación.

## SeaORM (`/websites/rs_sea-orm_1_1_14`)

Genera `Entity/Model/ActiveModel` (incl. `sea-orm-cli generate entity` desde BD existente). Soporta SQL crudo (`execute_unprepared`, `Statement::from_sql_and_values`, `from_raw_sql`).
⚠️ `begin()` da un `DatabaseTransaction`; hay que ejecutar `set_config` **sobre la transacción** (no sobre el `DatabaseConnection`, que abriría otra conexión). Internamente SeaORM usa el patrón (`set_transaction_config` en `sqlx_postgres.rs`) pero **no expone API pública de alto nivel para RLS**; el closure de `transaction()` no ofrece punto de inyección previo limpio. Riesgo: dependes de comportamiento no documentado como patrón RLS.

## Diesel + diesel-async (`/diesel-rs/diesel`, `/diesel-rs/diesel_async`)

DSL tipado verificado en compilación (`diesel print-schema` desde BD existente). SQL crudo: `sql_query().bind()` (para SELECT/DML tipado) y `batch_execute()` (multi-statement, **sin bind params**).
⚠️ Para RLS: `pool.get()` → `batch_execute("SELECT set_config(...)")` → mismo `conn` en `transaction()`. Problema: `batch_execute` **no soporta `$1`** ⇒ habría que **interpolar el `organization_id`** a mano (superficie de inyección que sanear). `sql_query().bind()` no sirve para `set_config` (no devuelve filas tipadas).

---

## Tabla comparativa (cada celda según doc; "n/c" = no confirmado en doc)

| Dimensión                        | SQLx                                       | SeaORM                                     | Diesel + diesel-async                                    |
| -------------------------------- | ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| Madurez/mantenimiento            | Alta, muy adoptado                         | Alta, v1.1 estable (2.0 RC)                | Diesel alta; diesel-async más joven                      |
| Async nativo                     | Sí (Tokio)                                 | Sí (sobre SQLx)                            | diesel-async añade capa async                            |
| Verificación en compilación      | Sí (`query!`)                              | No (runtime)                               | Sí (DSL); `sql_query` no                                 |
| SQL crudo arbitrario             | Sí, con bind                               | Sí (`execute_unprepared`, `Statement`)     | `sql_query().bind()` y `batch_execute()` sin bind        |
| **Control de conexión para RLS** | **Excelente** (`acquire()`+`$1`+`begin()`) | Parcial (sobre la tx; sin API RLS pública) | Viable pero `batch_execute` sin bind ⇒ interpolar tenant |
| Generación desde BD existente    | No (structs a mano)                        | Sí (`sea-orm-cli`)                         | Sí (`print-schema`)                                      |
| Migraciones                      | `sqlx migrate` / `migrate!`                | `sea_orm_migration`                        | `diesel migration`                                       |
| Curva de aprendizaje             | Baja-media                                 | Media-alta                                 | Alta                                                     |

---

## Veredicto

**SQLx** es la opción con mejor encaje documentado para el RLS multi-tenant, y la **recomendación** para esta migración:

1. `pool.acquire()` da una conexión explícita que el dev controla — ningún pool rota la conexión entre `set_config` y las queries.
2. `set_config` con bind `$1` — sin interpolación, sin superficie de inyección.
3. `conn.begin()` garantiza tenant + queries en la misma conexión física.
4. Sin ORM generando queries fuera de control → auditable, alineado con seguridad como prioridad.

Coste: SQLx no genera structs desde la BD; se escriben a mano (mitigable con generador o derivando de `schema.prisma`). Es un coste asumible frente a la garantía de control sobre el RLS.

> **Decisión sujeta a validación** con un _spike_ (prueba de concepto) que ejecute los tests de RLS actuales (`apps/api/test/rls.integration.spec.ts` portados) contra una implementación SQLx, antes de comprometer toda la migración.

---

## Fuentes (Context7)

- SQLx: `/websites/rs_sqlx_sqlx`
- SeaORM 1.1.14: `/websites/rs_sea-orm_1_1_14`
- Diesel: `/diesel-rs/diesel` · Diesel Async: `/diesel-rs/diesel_async`
