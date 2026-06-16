//! Configuración de auth (doc 06), validada al arranque (fail-fast). Los
//! secretos JWT son OBLIGATORIOS y viven en `SecretString` (sin defaults, igual
//! que el backend NestJS — `auth.module.ts` lanza si faltan).

use std::time::Duration;

use secrecy::SecretString;

/// TTLs por defecto (paridad NestJS: access 15m, refresh 7d).
const ACCESS_TTL_SECS: u64 = 15 * 60;
const REFRESH_TTL_SECS: u64 = 7 * 24 * 60 * 60;

#[derive(Clone)]
pub struct AuthConfig {
    pub access_secret: SecretString,
    pub refresh_secret: SecretString,
    pub access_ttl: Duration,
    pub refresh_ttl: Duration,
}

impl AuthConfig {
    /// Carga desde el entorno. `JWT_SECRET` y `JWT_REFRESH_SECRET` son
    /// obligatorios. Los TTL se leen en segundos (`JWT_ACCESS_TTL_SECS`,
    /// `JWT_REFRESH_TTL_SECS`) con los defaults de arriba.
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            access_secret: required("JWT_SECRET")?.into(),
            refresh_secret: required("JWT_REFRESH_SECRET")?.into(),
            access_ttl: Duration::from_secs(secs("JWT_ACCESS_TTL_SECS", ACCESS_TTL_SECS)),
            refresh_ttl: Duration::from_secs(secs("JWT_REFRESH_TTL_SECS", REFRESH_TTL_SECS)),
        })
    }
}

fn required(key: &str) -> anyhow::Result<String> {
    std::env::var(key).map_err(|_| anyhow::anyhow!("{key} no definida (obligatoria para auth)"))
}

fn secs(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
