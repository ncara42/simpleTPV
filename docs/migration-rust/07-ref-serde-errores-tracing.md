# Migración backend a Rust — 07. Referencia serde · errores · tracing · config

> Documentación **oficial** vía Context7. Código verbatim; nada inventado.
> Crates transversales idiomáticas para Axum + Tokio.

---

## 1. serde / serde_json (`/websites/serde_rs`)

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]   // CRÍTICO: el cliente React espera camelCase
struct CreateSaleRequest {
    total_amount: f64,               // ⇒ "totalAmount"
    organization_id: String,         // ⇒ "organizationId"
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default)]
    notes: String,
}
```

Atributos clave: `rename_all = "camelCase"`, `rename = "apiKey"`, `skip_serializing_if`, `default` / `default = "fn"`, `flatten` (capturar campos extra en `HashMap<String, Value>`), `deny_unknown_fields` (rechazar campos no declarados — replica `forbidNonWhitelisted`).

Enums tagged (discriminador estilo TS):

```rust
#[serde(tag = "type")]               // internally tagged → {"type":"Request", ...}
enum Message { Request { id: String }, Response { id: String } }
```

Fechas: `chrono = { version = "0.4", features = ["serde"] }` serializa RFC 3339 nativo. Solo usar módulo `#[serde(with = "...")]` para formatos no estándar.

---

## 2. thiserror (`/dtolnay/thiserror`) — errores de dominio/librería

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DataStoreError {
    #[error("data store disconnected")]
    Disconnect(#[from] std::io::Error),      // #[from] → From + source + `?`
    #[error("the data for key `{0}` is not available")]
    Redaction(String),
    #[error("invalid header (expected {expected:?}, found {found:?})")]
    InvalidHeader { expected: String, found: String },
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
```

`#[from]` genera la conversión y marca el campo como `source` (usable con `?`). `#[source]` encadena causa sin conversión automática. `#[error(transparent)]` delega Display/source.

> Capa **Domain/Repository** → `thiserror`. Cada variante se mapea a un status HTTP en `AppError::into_response` (ver doc Axum). Las violaciones de SQLx (`ErrorKind::UniqueViolation` → 409, etc.) entran como variantes.

---

## 3. anyhow (`/websites/rs_anyhow`) — errores de aplicación/binario

```rust
use anyhow::{Context, Result};
pub fn do_it(it: ImportantThing) -> Result<Vec<u8>> {
    let content = std::fs::read(&it.path)
        .with_context(|| format!("Failed to read instrs from {}", it.path.display()))?;
    Ok(content)
}
return Err(anyhow::anyhow!("tenant {tenant_id} not found"));
```

`.context("msg")` eager (literales); `.with_context(|| ...)` lazy (interpolación). Encadena causas en `{:?}`.

**Regla:** ¿el llamador necesita hac`match` de variantes? **Sí → thiserror** (dominio/repos). **No → anyhow** (handler/main). En Axum, `AppError::Internal(anyhow::Error)` recoge lo opaco; las variantes tipadas recogen lo que el cliente debe distinguir.

---

## 4. tracing + tracing-subscriber (`/websites/rs_tracing`, `/websites/rs_tracing-subscriber`)

```rust
use tracing::{info, error, instrument};

#[instrument(skip(db), fields(org_id = %org_id))]   // span por request con tenant
async fn get_sales(org_id: String, db: DatabasePool) -> Result<Json<Vec<Sale>>, AppError> {
    info!("fetching sales for organization");
    let sales = db.query_sales(&org_id).await?;
    Ok(Json(sales))
}
```

Inicialización dev vs prod:

```rust
use tracing_subscriber::{EnvFilter, fmt};
if is_production {
    fmt().json().flatten_event(true).with_env_filter(EnvFilter::from_default_env()).init();
} else {
    fmt().pretty().with_env_filter(EnvFilter::from_default_env()).init();
}
```

`RUST_LOG=info,my_crate=debug`. Correlación HTTP automática con `tower_http::trace::TraceLayer` (método, URI, status, latencia) — ya integrado en el stack de doc Axum. Sustituye logger Nest + se integra con Sentry vía capa.

---

## 5. config (`/rust-cli/config-rs`) — configuración tipada, fail-fast al arranque

```rust
use config::{Config, Environment, File};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Settings { pub server: ServerSettings, pub database: DatabaseSettings }

impl Settings {
    pub fn new() -> Result<Self, config::ConfigError> {
        let mode = std::env::var("RUN_MODE").unwrap_or_else(|_| "development".into());
        Config::builder()
            .set_default("server.workers", 4)?
            .add_source(File::with_name("config/default").required(false))
            .add_source(File::with_name(&format!("config/{mode}")).required(false))
            .add_source(Environment::with_prefix("APP").separator("_").try_parsing(true))
            .build()?
            .try_deserialize()        // falla si la config es inválida
    }
}
// En main: if let Err(e) = Settings::new() { eprintln!("{e}"); std::process::exit(1); }
```

> `APP_DATABASE_URL` → `database.url`. Validación tipada al arranque = fail-fast (igual que el fail-fast de CORS/secrets actual). 12-factor friendly para Docker/Dokploy. Combinar con `secrecy` para campos sensibles.

---

## Fuentes (Context7)

| Crate              | Library ID                        |
| ------------------ | --------------------------------- |
| serde / serde_json | `/websites/serde_rs`              |
| thiserror          | `/dtolnay/thiserror`              |
| anyhow             | `/websites/rs_anyhow`             |
| tracing            | `/websites/rs_tracing`            |
| tracing-subscriber | `/websites/rs_tracing-subscriber` |
| config             | `/rust-cli/config-rs`             |
