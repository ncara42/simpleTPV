//! Pool de conexiones PostgreSQL (doc 04 §1).

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};

/// Construye el pool del rol `app` (RLS aplicada). `set_config` del tenant NO
/// va aquí (es scope de transacción): se ejecuta dentro de cada transacción
/// RLS con `is_local = true` (ver `tenant::with_tenant_tx`).
///
/// Defensa en profundidad: como TODO `set_config` usa `is_local = true`, el
/// tenant nunca sobrevive al fin de su transacción y la conexión vuelve limpia
/// al pool. Si en el futuro alguien usara `is_local = false`, habría que añadir
/// un `before_acquire` que limpie el setting (coste: un round-trip por acquire).
///
/// Límites de conexión como constantes por ahora; cuando haya configuración por
/// entorno (réplicas, `POOL_MAX`) `build_pool` tomará un struct de opciones.
pub async fn build_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
}
