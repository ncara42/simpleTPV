//! Caché de stock en Redis (#155, #28). Acelera las lecturas de cantidad por
//! par (producto, tienda); la **fuente de verdad sigue siendo Postgres**. Es
//! best-effort y DEGRADABLE: sin `REDIS_URL` (o si Redis falla) las operaciones
//! son no-op y todo cae a Postgres. Patrón:
//!   - write-through: cada mutación de stock (`apply_movement`) fija la cantidad
//!     resultante en caché (con TTL como red de seguridad ante valores perdidos
//!     o de transacciones que luego revierten).
//!   - cache-aside: la lectura (`by_product`) consulta la caché; en miss usa el
//!     valor de Postgres y repuebla.
//!
//! Solo se cachea la `quantity`; `minStock`/nivel siempre salen de Postgres.

use std::sync::LazyLock;
use std::time::Duration;

use rust_decimal::Decimal;
use tokio::sync::OnceCell;
use uuid::Uuid;

/// TTL de las entradas (segundos): red de seguridad ante write-throughs perdidos.
const TTL_SECS: u64 = 300;
/// Tope por operación: best-effort, una caché lenta no debe colgar la tx de venta.
const OP_TIMEOUT: Duration = Duration::from_millis(100);

/// Caché de stock. `client = None` ⇒ deshabilitada (todas las ops son no-op).
pub struct StockCache {
    client: Option<redis::Client>,
    conn: OnceCell<redis::aio::MultiplexedConnection>,
}

impl StockCache {
    /// Construye desde una URL opcional (`None`/vacía/ inválida ⇒ deshabilitada).
    pub fn connect(url: Option<&str>) -> Self {
        let client = url
            .filter(|u| !u.is_empty())
            .and_then(|u| match redis::Client::open(u) {
                Ok(c) => Some(c),
                Err(e) => {
                    tracing::warn!(error = %e, "REDIS_URL inválida; caché de stock deshabilitada");
                    None
                }
            });
        Self {
            client,
            conn: OnceCell::new(),
        }
    }

    fn from_env() -> Self {
        Self::connect(std::env::var("REDIS_URL").ok().as_deref())
    }

    /// `true` si hay cliente Redis configurado (no garantiza conectividad).
    pub fn is_enabled(&self) -> bool {
        self.client.is_some()
    }

    /// Conexión multiplexada (clonable y reusable), inicializada una sola vez.
    async fn connection(&self) -> Option<redis::aio::MultiplexedConnection> {
        let client = self.client.as_ref()?;
        let conn = self
            .conn
            .get_or_try_init(|| client.get_multiplexed_async_connection())
            .await
            .map_err(|e| tracing::warn!(error = %e, "no se pudo conectar a Redis"))
            .ok()?;
        Some(conn.clone())
    }

    /// Cantidad cacheada del par (producto, tienda), o `None` (miss/deshabilitada).
    pub async fn get_quantity(&self, org: Uuid, store: Uuid, product: Uuid) -> Option<Decimal> {
        let mut conn = self.connection().await?;
        let key = stock_key(org, store, product);
        let mut cmd = redis::cmd("GET");
        cmd.arg(&key);
        let fut = cmd.query_async::<Option<String>>(&mut conn);
        let value = tokio::time::timeout(OP_TIMEOUT, fut).await.ok()?.ok()?;
        value.and_then(|s| s.parse::<Decimal>().ok())
    }

    /// Fija la cantidad del par con TTL. Best-effort: ignora cualquier error.
    pub async fn set_quantity(&self, org: Uuid, store: Uuid, product: Uuid, qty: Decimal) {
        let Some(mut conn) = self.connection().await else {
            return;
        };
        let key = stock_key(org, store, product);
        let mut cmd = redis::cmd("SET");
        cmd.arg(&key).arg(qty.to_string()).arg("EX").arg(TTL_SECS);
        let fut = cmd.query_async::<()>(&mut conn);
        let _ = tokio::time::timeout(OP_TIMEOUT, fut).await;
    }
}

/// Clave por tenant + tienda + producto (paridad con `stockCacheKey` de NestJS).
fn stock_key(org: Uuid, store: Uuid, product: Uuid) -> String {
    format!("stock:{org}:{store}:{product}")
}

/// Caché de proceso, configurada desde `REDIS_URL` al primer uso.
static STOCK_CACHE: LazyLock<StockCache> = LazyLock::new(StockCache::from_env);

/// Lee la cantidad cacheada (no-op ⇒ `None`). La usa `stock::by_product`.
pub async fn cached_quantity(org: Uuid, store: Uuid, product: Uuid) -> Option<Decimal> {
    STOCK_CACHE.get_quantity(org, store, product).await
}

/// Write-through de la cantidad resultante. La usa `stock::apply_movement`.
pub async fn cache_quantity(org: Uuid, store: Uuid, product: Uuid, qty: Decimal) {
    STOCK_CACHE.set_quantity(org, store, product, qty).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn deshabilitada_es_noop() {
        let cache = StockCache::connect(None);
        assert!(!cache.is_enabled());
        let (org, store, product) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        // set no rompe; get siempre None.
        cache
            .set_quantity(org, store, product, Decimal::from(7))
            .await;
        assert_eq!(cache.get_quantity(org, store, product).await, None);
    }

    #[tokio::test]
    async fn roundtrip_set_get() {
        // Sin credencial hardcodeada (M-01): exige REDIS_URL en el entorno; si no
        // está (p. ej. CI sin servicio Redis), se omite el test.
        let Ok(url) = std::env::var("REDIS_URL") else {
            eprintln!("REDIS_URL no definida — roundtrip omitido");
            return;
        };
        let cache = StockCache::connect(Some(&url));
        if cache.connection().await.is_none() {
            eprintln!("Redis no accesible — roundtrip omitido");
            return;
        }
        let (org, store, product) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        assert_eq!(cache.get_quantity(org, store, product).await, None, "vacío");
        cache
            .set_quantity(org, store, product, Decimal::new(425, 1))
            .await; // 42.5
        assert_eq!(
            cache.get_quantity(org, store, product).await,
            Some(Decimal::new(425, 1)),
            "lee lo que escribió"
        );
    }
}
