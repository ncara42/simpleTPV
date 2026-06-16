# Migración backend a Rust — 04. Referencia SQLx + RLS multi-tenant

> Documentación **oficial** vía Context7. Código verbatim; nada inventado.
> Fuente principal: `/websites/rs_sqlx_sqlx` (docs.rs/sqlx). Benchmark High.
> Capa de datos objetivo para sustituir Prisma manteniendo el **RLS por tenant**.

---

## 1. Connection pool (`PgPoolOptions`)

```rust
use std::time::Duration;
use sqlx::postgres::PgPoolOptions;

let pool = PgPoolOptions::new()
    .max_connections(20)
    .min_connections(2)
    .acquire_timeout(Duration::from_secs(5))
    .connect("postgres://user:password@localhost:5434/mydb")
    .await?;
```

`after_connect` se ejecuta una vez por conexión nueva (p.ej. `SET application_name`). **NO** es el sitio para `set_config` de tenant (scope transacción) — eso va dentro de cada transacción (§3).

---

## 2. Queries

**Macros compile-time** (`query!`, `query_as!`, `query_scalar!`) — typecheck contra la BD real en build:

```rust
let account = sqlx::query!("SELECT id, name FROM accounts WHERE id = $1", user_id)
    .fetch_one(&mut conn).await?;
```

**Runtime** (`query`, `query_as`) — sin verificación en compilación pero flexible.

**Modo offline (CI sin BD):** `cargo sqlx prepare` genera `.sqlx/` (commitear); compilar con `SQLX_OFFLINE=true` sin `DATABASE_URL`. Encaja con nuestro CI Turborepo.

**Seguridad (confirmado por doc):** _"Use query parameters with placeholders like `$1`, `$2` for dynamic input to prevent SQL injection. This method binds values securely at execution time."_ El driver nunca interpola; envía el valor por el extended query protocol.

---

## 3. Transacciones y patrón RLS por tenant — INVARIANTE CRÍTICO

Doc de `Transaction`: _"A transaction starts with a call to `Pool::begin` or `Connection::begin`... `rollback` is called on `drop` if the transaction is still in-progress."_ (rollback automático si no hay commit → fail-safe).

### Patrón recomendado para RLS (replica el `$extends` de Prisma)

```rust
// 1. Adquirir una conexión EXPLÍCITA del pool (no rota entre pasos)
let mut conn = pool.acquire().await?;        // PoolConnection<Postgres>

// 2. set_config con bind param — is_local=true → scope de transacción
sqlx::query("SELECT set_config('app.current_organization_id', $1, true)")
    .bind(&tenant_id)                         // viene del JWT, nunca del body
    .execute(&mut *conn)
    .await?;

// 3. BEGIN sobre LA MISMA conexión
let mut tx = conn.begin().await?;            // Transaction<'_, Postgres>

// 4. Todas las queries del request en esa transacción → RLS activo
sqlx::query("INSERT INTO orders ...").execute(&mut *tx).await?;

tx.commit().await?;                          // la conexión vuelve al pool al soltar conn
```

> **Por qué `acquire()` y no solo `begin()`:** para ejecutar `set_config` _antes_ del BEGIN sobre la misma conexión física. `pool.begin()` también vale si se hace `set_config(..., true)` como primera query _dentro_ de la transacción (is_local sigue acotado a la tx). Ambas variantes son válidas; decidir en implementación.
> **Fail-safe:** sin tenant ⇒ no se ejecuta `set_config` ⇒ las policies RLS no encuentran `current_setting` ⇒ 0 filas. Igual que hoy.

Variante con closure (commit/rollback automático):

```rust
conn.transaction(|txn| Box::pin(async move {
    sqlx::query("SELECT * FROM ..").fetch_all(&mut **txn).await
})).await
```

---

## 4. Mapeo de filas y tipos

```rust
#[derive(sqlx::FromRow, Debug)]
struct User { id: i64, username: String, created_at: time::OffsetDateTime }

let users: Vec<User> = sqlx::query_as("SELECT id, username, created_at FROM users")
    .fetch_all(&mut conn).await?;
let one: Option<User> = sqlx::query_as("...").fetch_optional(&mut conn).await?;
```

| Feature Cargo      | Rust                                                    | Postgres                        |
| ------------------ | ------------------------------------------------------- | ------------------------------- |
| `uuid`             | `uuid::Uuid`                                            | UUID                            |
| `chrono`           | `chrono::DateTime<Utc>` / `NaiveDateTime` / `NaiveDate` | TIMESTAMPTZ / TIMESTAMP / DATE  |
| `time`             | `time::OffsetDateTime`                                  | TIMESTAMPTZ                     |
| **`rust_decimal`** | `rust_decimal::Decimal`                                 | **NUMERIC** ← dinero/cantidades |
| `bigdecimal`       | `bigdecimal::BigDecimal`                                | NUMERIC                         |
| `json`             | `serde_json::Value` o tipo `serde`                      | JSON/JSONB                      |

> **Contable:** usar `rust_decimal::Decimal` para precios/cantidades (`Decimal(10,4)`, `Decimal(12,2)`, `Decimal(10,3)`). **Nunca `f64`.** Nota doc: _"NUMERIC can represent all rust_decimal::Decimal values, but not vice-versa. Encoding should not fail, but decoding might."_

Enums/tipos compuestos con `#[derive(sqlx::Type)]` + `#[sqlx(type_name = "...")]`.

---

## 5. Migraciones

```rust
sqlx::migrate!("db/migrations").run(&pool).await?;   // embebidas en el binario
static MIGRATOR: Migrator = sqlx::migrate!();        // por defecto ./migrations
```

**Convivencia con Prisma:** la doc no lo prohíbe. Si el esquema (tablas + policies RLS + roles) lo sigue gestionando Prisma Migrate, SQLx puede conectar a la BD ya migrada y/o usar `migrate!` solo para scripts auxiliares en un directorio separado. **No** dejar que dos herramientas gestionen las mismas tablas. (Decisión de estrategia de esquema: ver doc de síntesis.)

---

## 6. Manejo de errores (sustituye `PrismaExceptionFilter`)

`sqlx::Error` es `#[non_exhaustive]` (siempre brazo `_`). Detección de constraints vía `ErrorKind`:

```rust
use sqlx::error::ErrorKind;
match result {
    Err(sqlx::Error::Database(db)) => match db.kind() {
        ErrorKind::UniqueViolation     => /* → 409 (era P2002) */,
        ErrorKind::ForeignKeyViolation => /* → 409 (era P2003) */,
        _ => return Err(sqlx::Error::Database(db)),
    },
    Err(sqlx::Error::RowNotFound)  => /* → 404 (era P2025) */,
    Err(sqlx::Error::PoolTimedOut) => /* pool saturado */,
    other => other?,
}
```

---

## 7. `Cargo.toml` de referencia

```toml
[dependencies]
sqlx = { version = "0.8", features = [
  "postgres", "runtime-tokio", "tls-rustls",
  "uuid", "chrono", "rust_decimal", "json", "migrate",
] }
uuid = { version = "1", features = ["v4", "serde"] }
rust_decimal = "1"
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1", features = ["full"] }
```

---

## Fuentes (Context7)

`/websites/rs_sqlx_sqlx` (docs.rs/sqlx): `postgres/type.PgPoolOptions.html`, `pool/struct.PoolOptions.html`, `macro.query.html`, `fn.query.html`, `fn.query_as.html`, `struct.Transaction.html`, `trait.Connection.html`, `struct.Pool.html`, `postgres/types/index.html`, `macro.migrate.html`, `enum.Error.html`, `error/enum.ErrorKind.html`.
