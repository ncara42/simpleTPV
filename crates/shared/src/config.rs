//! Configuración del servicio, leída del entorno y validada al arranque
//! (fail-fast, doc 07 §5). Las URLs con credenciales viven en `SecretString`
//! para no aparecer en logs por accidente (doc 06 §4); el acceso es explícito
//! vía `expose_secret()`, fácil de auditar en review.

use secrecy::SecretString;

/// Configuración mínima de la Fase 0 (bootstrap + capa de datos).
///
/// 12-factor: todo viene del entorno. Cuando haya configuración por ficheros
/// (varios entornos) se adoptará el crate `config` (doc 07 §5); hoy sería
/// generalidad especulativa (YAGNI).
#[derive(Clone)]
pub struct AppConfig {
    /// Conexión del rol `app` (RLS aplicada). Es el runtime del API.
    pub database_url_app: SecretString,
    /// Dirección de escucha del servidor HTTP.
    pub bind_addr: String,
}

impl AppConfig {
    /// Carga y valida la configuración. Falla si falta una variable obligatoria.
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url_app = std::env::var("DATABASE_URL_APP")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL_APP no definida"))?;
        let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3001".to_owned());

        Ok(Self {
            database_url_app: SecretString::from(database_url_app),
            bind_addr,
        })
    }
}
