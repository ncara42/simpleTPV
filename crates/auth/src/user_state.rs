//! Revalidación del estado del usuario por petición (A-04) — port de
//! `UserStateService` de NestJS.
//!
//! El extractor `AuthUser` (capa http) solo verifica la firma y `exp` del access
//! token. Sin esto, un usuario desactivado o degradado conservaría privilegios
//! hasta caducar su token (ventana ≤15 min). Aquí se revalida `active`/`role`
//! contra la BD con una **caché en-proceso de pocos segundos**: acota el coste a
//! un lookup por usuario y ventana, y cachea también el negativo (usuario
//! borrado) para no martillear la BD.
//!
//! El lookup usa el rol **app_admin (BYPASSRLS)** porque la revalidación corre
//! ANTES de fijar el tenant (igual que login/refresh). La caché es en-proceso (no
//! Redis): cada réplica revalida de forma independiente y la ventana de
//! inconsistencia se mantiene en ~TTL.
//!
//! La política fail-closed/fail-open por rol ante un fallo de infraestructura
//! vive en la capa http (el extractor), igual que en el `AuthGuard` de NestJS.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use sqlx::PgPool;
use uuid::Uuid;

use simpletpv_shared::AppError;

use crate::claims::Role;

/// TTL por defecto de la caché de revalidación (ms). Paridad con NestJS.
const DEFAULT_TTL_MS: u64 = 15_000;

/// Tope de entradas vivas en la caché. Acota la memoria: solo se insertan claves
/// de usuarios con un access token VÁLIDO (la revalidación corre tras verificar
/// la firma), así que el universo de claves ya está limitado a usuarios reales;
/// el tope es defensa en profundidad ante un proceso muy longevo o una base de
/// usuarios grande. Una entrada (`Uuid` + estado) ocupa ~decenas de bytes →
/// 50_000 entradas son <2 MB. Al rebasar el tope, los usuarios nuevos no se
/// cachean (revalidan en cada petición: más carga de BD, nunca estado obsoleto).
const DEFAULT_MAX_ENTRIES: usize = 50_000;

/// Estado mínimo del usuario para revalidar la sesión por petición.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserState {
    pub active: bool,
    pub role: Role,
}

/// Puerto que la caché consume para leer el estado del usuario. Desacoplado para
/// poder mockearlo en tests (paridad con `UserStateValidator` de NestJS).
pub trait UserStateLookup: Send + Sync {
    fn get_user_state(
        &self,
        user_id: Uuid,
    ) -> impl std::future::Future<Output = Result<Option<UserState>, AppError>> + Send;
}

/// Lookup contra la BD por el rol `app_admin` (BYPASSRLS). Selecciona solo lo
/// necesario (no trae `passwordHash`/`pinHash`).
pub struct DbUserStateLookup {
    admin: PgPool,
}

impl DbUserStateLookup {
    /// `admin` debe ser una conexión al rol `app_admin` (BYPASSRLS).
    pub fn new(admin: PgPool) -> Self {
        Self { admin }
    }
}

const USER_STATE_BY_ID: &str = "SELECT active, role::text AS role FROM \"User\" WHERE id = $1";

impl UserStateLookup for DbUserStateLookup {
    async fn get_user_state(&self, user_id: Uuid) -> Result<Option<UserState>, AppError> {
        let row: Option<(bool, String)> = sqlx::query_as(USER_STATE_BY_ID)
            .bind(user_id)
            .fetch_optional(&self.admin)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "lookup de revalidación de usuario falló");
                AppError::Internal
            })?;
        match row {
            Some((active, role)) => Ok(Some(UserState {
                active,
                role: Role::from_db(&role)?,
            })),
            None => Ok(None),
        }
    }
}

struct Entry {
    state: Option<UserState>,
    expires_at: Instant,
}

/// Revalida `active`/`role` con una caché en-proceso de TTL corto (A-04).
pub struct UserStateService<L> {
    lookup: L,
    cache: Mutex<HashMap<Uuid, Entry>>,
    ttl: Duration,
    max_entries: usize,
}

impl<L: UserStateLookup> UserStateService<L> {
    /// TTL desde `AUTH_REVALIDATE_TTL_MS` (default 15s).
    pub fn new(lookup: L) -> Self {
        Self::with_ttl(lookup, ttl_from_env())
    }

    pub fn with_ttl(lookup: L, ttl: Duration) -> Self {
        Self::with_ttl_and_cap(lookup, ttl, DEFAULT_MAX_ENTRIES)
    }

    fn with_ttl_and_cap(lookup: L, ttl: Duration, max_entries: usize) -> Self {
        Self {
            lookup,
            cache: Mutex::new(HashMap::new()),
            ttl,
            max_entries,
        }
    }

    /// Devuelve el estado del usuario, sirviéndolo de caché mientras no expire.
    /// Cachea positivos y negativos; un error del lookup se propaga SIN cachear
    /// (para que el extractor aplique fail-closed/fail-open por rol).
    pub async fn get_state(&self, user_id: Uuid) -> Result<Option<UserState>, AppError> {
        {
            let cache = self.lock_cache();
            if let Some(entry) = cache.get(&user_id) {
                if entry.expires_at > Instant::now() {
                    return Ok(entry.state.clone());
                }
            }
        } // libera el lock ANTES del await (no se sostiene cruzando .await)

        let state = self.lookup.get_user_state(user_id).await?;

        // El TTL se cuenta desde DESPUÉS del lookup: la entrada vive como mucho
        // `ttl` desde que se almacena, sin descontar la latencia de la consulta.
        let expires_at = Instant::now() + self.ttl;
        let mut cache = self.lock_cache();
        // Refresco de una clave ya presente: siempre permitido (no crece). Clave
        // nueva con la caché llena: primero purga caducadas; si sigue llena, no se
        // cachea (fail-safe: revalidará en cada petición, nunca sirve obsoleto).
        let refreshing = cache.contains_key(&user_id);
        if !refreshing && cache.len() >= self.max_entries {
            cache.retain(|_, e| e.expires_at > Instant::now());
        }
        if refreshing || cache.len() < self.max_entries {
            cache.insert(
                user_id,
                Entry {
                    state: state.clone(),
                    expires_at,
                },
            );
        }
        Ok(state)
    }

    /// Toma el lock de la caché recuperándose de un posible envenenamiento (un
    /// pánico previo sosteniendo el lock no debe derribar al resto: la caché es
    /// reconstruible y no crítica para la corrección).
    fn lock_cache(&self) -> std::sync::MutexGuard<'_, HashMap<Uuid, Entry>> {
        self.cache.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn ttl_from_env() -> Duration {
    parse_ttl_ms(std::env::var("AUTH_REVALIDATE_TTL_MS").ok().as_deref())
}

/// Parsea el TTL en ms; valor ausente, negativo o no numérico → default 15s.
/// `0` es válido y desactiva la caché (revalida en cada petición).
fn parse_ttl_ms(raw: Option<&str>) -> Duration {
    let ms = raw
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_TTL_MS);
    Duration::from_millis(ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Lookup mock con contador de llamadas y resultado fijo (paridad con el
    /// `makeLookup` de `user-state.service.spec.ts`).
    struct MockLookup {
        calls: Arc<AtomicUsize>,
        result: Result<Option<UserState>, AppError>,
    }

    impl MockLookup {
        fn new(result: Result<Option<UserState>, AppError>) -> (Self, Arc<AtomicUsize>) {
            let calls = Arc::new(AtomicUsize::new(0));
            (
                Self {
                    calls: calls.clone(),
                    result,
                },
                calls,
            )
        }
    }

    impl UserStateLookup for MockLookup {
        async fn get_user_state(&self, _user_id: Uuid) -> Result<Option<UserState>, AppError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.result.clone()
        }
    }

    fn active_admin() -> UserState {
        UserState {
            active: true,
            role: Role::Admin,
        }
    }

    #[tokio::test]
    async fn devuelve_el_estado_y_cachea_el_resultado_un_solo_lookup() {
        let (lookup, calls) = MockLookup::new(Ok(Some(active_admin())));
        let svc = UserStateService::new(lookup); // TTL default 15s

        let id = Uuid::new_v4();
        assert_eq!(svc.get_state(id).await.unwrap(), Some(active_admin()));
        assert_eq!(svc.get_state(id).await.unwrap(), Some(active_admin()));
        assert_eq!(calls.load(Ordering::SeqCst), 1, "solo un lookup (caché)");
    }

    #[tokio::test]
    async fn cachea_tambien_el_negativo_usuario_no_encontrado() {
        let (lookup, calls) = MockLookup::new(Ok(None));
        let svc = UserStateService::new(lookup);

        let id = Uuid::new_v4();
        assert_eq!(svc.get_state(id).await.unwrap(), None);
        assert_eq!(svc.get_state(id).await.unwrap(), None);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "negativo cacheado");
    }

    #[tokio::test]
    async fn con_ttl_cero_revalida_en_cada_llamada() {
        let (lookup, calls) = MockLookup::new(Ok(Some(active_admin())));
        let svc = UserStateService::with_ttl(lookup, Duration::ZERO);

        let id = Uuid::new_v4();
        svc.get_state(id).await.unwrap();
        svc.get_state(id).await.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2, "sin caché efectivo");
    }

    #[tokio::test]
    async fn propaga_el_error_del_lookup_sin_cachear() {
        let (lookup, calls) = MockLookup::new(Err(AppError::Internal));
        let svc = UserStateService::new(lookup);

        let id = Uuid::new_v4();
        assert_eq!(svc.get_state(id).await, Err(AppError::Internal));
        // El error NO se cachea: una segunda llamada vuelve a intentar el lookup.
        assert_eq!(svc.get_state(id).await, Err(AppError::Internal));
        assert_eq!(calls.load(Ordering::SeqCst), 2, "el error no se cachea");
    }

    #[tokio::test]
    async fn la_cache_no_crece_por_encima_del_tope() {
        let (lookup, _) = MockLookup::new(Ok(Some(active_admin())));
        // TTL largo (no expira durante el test) y tope 2.
        let svc = UserStateService::with_ttl_and_cap(lookup, Duration::from_secs(3600), 2);

        for _ in 0..5 {
            svc.get_state(Uuid::new_v4()).await.unwrap();
        }
        assert_eq!(
            svc.cache.lock().unwrap().len(),
            2,
            "la caché se mantiene en el tope"
        );
    }

    #[test]
    fn parse_ttl_ms_usa_default_ante_valor_invalido_o_ausente() {
        assert_eq!(parse_ttl_ms(None), Duration::from_millis(15_000));
        assert_eq!(parse_ttl_ms(Some("")), Duration::from_millis(15_000));
        assert_eq!(parse_ttl_ms(Some("abc")), Duration::from_millis(15_000));
        assert_eq!(parse_ttl_ms(Some("-5")), Duration::from_millis(15_000));
        assert_eq!(parse_ttl_ms(Some("0")), Duration::ZERO);
        assert_eq!(parse_ttl_ms(Some("500")), Duration::from_millis(500));
    }
}
