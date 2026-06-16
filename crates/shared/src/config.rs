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
    /// Conexión del rol `app_admin` (BYPASSRLS). SOLO para el lookup de login/
    /// refresh, que ocurre antes de conocer el tenant (doc 06, `DATABASE_URL_AUTH`).
    pub database_url_admin: SecretString,
    /// Dirección de escucha del servidor HTTP.
    pub bind_addr: String,
    /// Orígenes CORS permitidos (los SPA: TPV y backoffice). En producción es
    /// obligatorio fijarlos por env; fuera de producción cae a los de dev (SEC-18).
    pub cors_origins: Vec<String>,
}

/// Orígenes CORS de desarrollo: los frontends (TPV y backoffice) en sus puertos
/// de dev (vite) y preview. Paridad con `DEFAULT_DEV_ORIGINS` de NestJS.
const DEFAULT_DEV_ORIGINS: [&str; 4] = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4173",
    "http://localhost:4174",
];

/// Parsea `CORS_ORIGINS` (CSV) → lista de orígenes. Recorta espacios, descarta
/// entradas vacías y descarta las que no parecen un origen (deben empezar por
/// `http://` o `https://`): así un `*` o una URL con path no se cuelan como
/// origen literal que el navegador nunca casaría. Sin la env (o vacía) →
/// orígenes de dev por defecto.
pub fn parse_cors_origins(env: Option<&str>) -> Vec<String> {
    match env {
        Some(s) if !s.trim().is_empty() => parse_origins_csv(s),
        _ => DEFAULT_DEV_ORIGINS.iter().map(|s| s.to_string()).collect(),
    }
}

/// Parsea el CSV crudo a orígenes válidos, SIN caer al default de dev. La rama de
/// producción de `resolve_cors_origins` lo usa para no enmascarar una env ausente.
fn parse_origins_csv(s: &str) -> Vec<String> {
    s.split(',')
        .map(str::trim)
        .filter(|o| looks_like_origin(o))
        .map(String::from)
        .collect()
}

/// Un origen válido tiene esquema http(s) y no incluye path (`scheme://host[:port]`).
fn looks_like_origin(o: &str) -> bool {
    let rest = o
        .strip_prefix("https://")
        .or_else(|| o.strip_prefix("http://"));
    match rest {
        Some(host) => !host.is_empty() && !host.contains('/'),
        None => false,
    }
}

/// Resuelve los orígenes CORS al arranque. En PRODUCCIÓN `CORS_ORIGINS` es
/// OBLIGATORIA: si falta o no contiene ningún origen válido, falla el arranque en
/// vez de caer a los orígenes de desarrollo (localhost) o a una política
/// deny-all silenciosa, evitando un fail-open/misconfig de configuración
/// (SEC-18). Fuera de producción mantiene el default de dev cómodo.
pub fn resolve_cors_origins(env: Option<&str>, is_production: bool) -> anyhow::Result<Vec<String>> {
    if is_production {
        // Parseo crudo (sin fallback a dev): una env ausente o sin orígenes
        // válidos debe abortar el arranque, no caer a localhost.
        let origins = env.map(parse_origins_csv).unwrap_or_default();
        if origins.is_empty() {
            anyhow::bail!(
                "CORS_ORIGINS es obligatoria en producción y debe contener al menos un origen http(s) válido"
            );
        }
        return Ok(origins);
    }
    Ok(parse_cors_origins(env))
}

impl AppConfig {
    /// Carga y valida la configuración. Falla si falta una variable obligatoria.
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url_app = std::env::var("DATABASE_URL_APP")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL_APP no definida"))?;
        let database_url_admin = std::env::var("DATABASE_URL_AUTH")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL_AUTH no definida (rol app_admin)"))?;
        let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3001".to_owned());
        // "Producción" = build release, mismo criterio que el flag `Secure` de la
        // cookie de refresh (un único señalizador de entorno, sin env extra).
        let cors_origins = resolve_cors_origins(
            std::env::var("CORS_ORIGINS").ok().as_deref(),
            cfg!(not(debug_assertions)),
        )?;

        Ok(Self {
            database_url_app: SecretString::from(database_url_app),
            database_url_admin: SecretString::from(database_url_admin),
            bind_addr,
            cors_origins,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cors_origins_default_cuando_falta_o_vacia() {
        assert_eq!(parse_cors_origins(None), DEFAULT_DEV_ORIGINS);
        assert_eq!(parse_cors_origins(Some("   ")), DEFAULT_DEV_ORIGINS);
    }

    #[test]
    fn parse_cors_origins_csv_recorta_y_descarta_vacias() {
        assert_eq!(
            parse_cors_origins(Some(" https://a.test , ,https://b.test ")),
            vec!["https://a.test".to_string(), "https://b.test".to_string()]
        );
    }

    #[test]
    fn parse_cors_origins_descarta_wildcard_y_origenes_con_path() {
        assert_eq!(
            parse_cors_origins(Some("https://a.test/api,*,https://b.test")),
            vec!["https://b.test".to_string()]
        );
    }

    #[test]
    fn resolve_cors_origins_falla_en_produccion_sin_env() {
        assert!(resolve_cors_origins(None, true).is_err());
        assert!(resolve_cors_origins(Some("  "), true).is_err());
    }

    #[test]
    fn resolve_cors_origins_falla_en_produccion_si_solo_hay_origenes_invalidos() {
        assert!(resolve_cors_origins(Some("*"), true).is_err());
        assert!(resolve_cors_origins(Some("https://a.test/path"), true).is_err());
    }

    #[test]
    fn resolve_cors_origins_en_produccion_acepta_lista_explicita() {
        assert_eq!(
            resolve_cors_origins(Some("https://admin.example.com"), true).unwrap(),
            vec!["https://admin.example.com".to_string()]
        );
    }

    #[test]
    fn resolve_cors_origins_fuera_de_produccion_cae_a_dev() {
        assert_eq!(
            resolve_cors_origins(None, false).unwrap(),
            DEFAULT_DEV_ORIGINS
        );
    }
}
