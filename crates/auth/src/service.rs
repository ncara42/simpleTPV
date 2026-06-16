//! `AuthService` — lógica de autenticación (login, rotación de refresh, logout).
//!
//! Usa el rol **app_admin (BYPASSRLS)** para el lookup de usuario y de tokens:
//! el login ocurre ANTES de conocer el tenant, así que con RLS (rol `app`) el
//! `SELECT` por email devolvería 0 filas. La conexión BYPASSRLS lo evita. Es la
//! ÚNICA vía de acceso a datos sin tenant; todo lo demás va por RLS.

use secrecy::ExposeSecret;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use simpletpv_shared::AppError;

use crate::claims::{AccessClaims, RefreshClaims, Role};
use crate::config::AuthConfig;
use crate::jwt::Jwt;
use crate::password::verify_password;

/// bcrypt trunca la entrada a 72 bytes; por encima rechazamos (paridad con el
/// `LoginDto` de NestJS) para no aceptar contraseñas distintas que comparten los
/// primeros 72 bytes.
const MAX_PASSWORD_BYTES: usize = 72;

/// Pareja de tokens emitida en login y en cada rotación.
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
}

pub struct AuthService {
    /// Pool del rol `app_admin` (BYPASSRLS) — lookup previo al tenant.
    admin: PgPool,
    jwt: Jwt,
    config: AuthConfig,
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    organization_id: Uuid,
    password_hash: String,
    role: String,
    active: bool,
}

#[derive(sqlx::FromRow)]
struct RefreshRow {
    family_id: Uuid,
    user_id: Uuid,
    used: bool,
    revoked: bool,
}

const USER_BY_EMAIL: &str = "SELECT id, \"organizationId\" AS organization_id, \
     \"passwordHash\" AS password_hash, role::text AS role, active \
     FROM \"User\" WHERE email = $1";

const USER_BY_ID: &str = "SELECT id, \"organizationId\" AS organization_id, \
     \"passwordHash\" AS password_hash, role::text AS role, active \
     FROM \"User\" WHERE id = $1";

const REFRESH_BY_ID: &str = "SELECT \"familyId\" AS family_id, \"userId\" AS user_id, \
     (\"usedAt\" IS NOT NULL) AS used, (\"revokedAt\" IS NOT NULL) AS revoked \
     FROM \"RefreshToken\" WHERE id = $1";

const INSERT_REFRESH: &str = "INSERT INTO \"RefreshToken\" \
     (id, \"organizationId\", \"userId\", \"familyId\", \"createdAt\") \
     VALUES ($1, $2, $3, $4, now())";

impl AuthService {
    /// `admin_pool` debe ser una conexión al rol `app_admin` (BYPASSRLS).
    pub fn new(admin_pool: PgPool, config: AuthConfig) -> Self {
        let jwt = Jwt::new(
            config.access_secret.expose_secret().as_bytes(),
            config.refresh_secret.expose_secret().as_bytes(),
        );
        Self {
            admin: admin_pool,
            jwt,
            config,
        }
    }

    /// Verifica un access token y devuelve sus claims. Núcleo del futuro
    /// extractor/guard de la capa http (equivalente a `AuthGuard`).
    pub fn verify_access_token(&self, token: &str) -> Result<AccessClaims, AppError> {
        self.jwt.verify_access(token)
    }

    /// `POST /auth/login`: valida credenciales y emite una pareja de tokens.
    pub async fn login(&self, email: &str, password: &str) -> Result<TokenPair, AppError> {
        if password.len() > MAX_PASSWORD_BYTES {
            // Verificación dummy para no romper la mitigación de timing (SEC-14).
            verify_password(password.to_owned(), None).await;
            return Err(AppError::Unauthorized);
        }

        let user: Option<UserRow> = sqlx::query_as(USER_BY_EMAIL)
            .bind(email)
            .fetch_optional(&self.admin)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "lookup de login falló");
                AppError::Internal
            })?;

        // SEC-14: se verifica bcrypt SIEMPRE; si no hay usuario o está inactivo
        // se pasa `None` (verifica contra el dummy) para no filtrar por timing.
        let hash = user
            .as_ref()
            .filter(|u| u.active)
            .map(|u| u.password_hash.clone());
        let ok = verify_password(password.to_owned(), hash).await;

        let user = match user {
            Some(u) if u.active && ok => u,
            _ => return Err(AppError::Unauthorized),
        };

        let role = Role::from_db(&user.role)?;
        // Nueva familia de tokens para esta sesión (login ⇒ sin carrera posible).
        let now = now_secs()?;
        let family = Uuid::new_v4();
        let jti = Uuid::new_v4();
        self.insert_refresh(user.id, user.organization_id, family, jti)
            .await?;
        Ok(TokenPair {
            access_token: self.sign_access(user.id, user.organization_id, role, now)?,
            refresh_token: self.sign_refresh(user.id, family, jti, now)?,
        })
    }

    /// `POST /auth/refresh`: rota el refresh token (SEC-06).
    ///
    /// Toda la mutación va en UNA transacción con `SELECT ... FOR UPDATE` sobre
    /// la fila del token. Un segundo intento sobre el MISMO token bloquea en el
    /// lock hasta el commit del primero; al desbloquearse ve el token ya usado Y
    /// el nuevo token ya insertado, de modo que su `revoke_family` alcanza
    /// también al token nuevo. Esto cierra la ventana de reuso concurrente.
    pub async fn refresh(&self, refresh_token: &str) -> Result<TokenPair, AppError> {
        let claims: RefreshClaims = self.jwt.verify_refresh(refresh_token)?;
        let jti = Uuid::parse_str(&claims.jti).map_err(|_| AppError::Unauthorized)?;

        let mut tx = self.admin.begin().await.map_err(|e| {
            tracing::error!(error = %e, "begin de refresh falló");
            AppError::Internal
        })?;

        let row: Option<RefreshRow> = sqlx::query_as(&format!("{REFRESH_BY_ID} FOR UPDATE"))
            .bind(jti)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "lookup de refresh token falló");
                AppError::Internal
            })?;

        let row = row.ok_or(AppError::Unauthorized)?;
        let family = row.family_id; // la BD manda sobre la familia (autoritativa)

        if row.revoked {
            return Err(AppError::Unauthorized); // tx se descarta → rollback
        }
        if row.used {
            // Reuso de un token ya rotado ⇒ revoca la familia entera.
            revoke_family_tx(&mut tx, family).await?;
            commit(tx).await?;
            return Err(AppError::Unauthorized);
        }

        // Marca como usado (sostenemos el FOR UPDATE; `usedAt` era NULL).
        let claimed = sqlx::query(
            "UPDATE \"RefreshToken\" SET \"usedAt\" = now() WHERE id = $1 AND \"usedAt\" IS NULL",
        )
        .bind(jti)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "markUsed del refresh token falló");
            AppError::Internal
        })?
        .rows_affected();
        if claimed == 0 {
            revoke_family_tx(&mut tx, family).await?;
            commit(tx).await?;
            return Err(AppError::Unauthorized);
        }

        // El usuario debe seguir activo. Si no, la tx hace rollback (el token
        // queda sin consumir, pero es inútil mientras el usuario esté inactivo).
        let user: Option<UserRow> = sqlx::query_as(USER_BY_ID)
            .bind(row.user_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "lookup de usuario en refresh falló");
                AppError::Internal
            })?;
        let user = user.filter(|u| u.active).ok_or(AppError::Unauthorized)?;
        let role = Role::from_db(&user.role)?;

        // Nuevo refresh token en la MISMA tx y la MISMA familia (rotación).
        let now = now_secs()?;
        let new_jti = Uuid::new_v4();
        sqlx::query(INSERT_REFRESH)
            .bind(new_jti)
            .bind(user.organization_id)
            .bind(user.id)
            .bind(family)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "persistir refresh token falló");
                AppError::Internal
            })?;

        commit(tx).await?;

        // Firma tras el commit (operación pura).
        Ok(TokenPair {
            access_token: self.sign_access(user.id, user.organization_id, role, now)?,
            refresh_token: self.sign_refresh(user.id, family, new_jti, now)?,
        })
    }

    /// `POST /auth/logout`: revoca la familia del refresh token. Busca la fila
    /// por `jti` y revoca la familia ALMACENADA (autoritativa), igual que
    /// `refresh`. Best-effort: un token no verificable no tiene nada que revocar.
    pub async fn logout(&self, refresh_token: &str) -> Result<(), AppError> {
        let Ok(claims) = self.jwt.verify_refresh::<RefreshClaims>(refresh_token) else {
            return Ok(());
        };
        let Ok(jti) = Uuid::parse_str(&claims.jti) else {
            return Ok(());
        };

        let row: Option<RefreshRow> = sqlx::query_as(REFRESH_BY_ID)
            .bind(jti)
            .fetch_optional(&self.admin)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "lookup de logout falló");
                AppError::Internal
            })?;
        if let Some(row) = row {
            self.revoke_family(row.family_id).await?;
        }
        Ok(())
    }

    /// Inserta un refresh token (login: sin transacción, familia nueva).
    async fn insert_refresh(
        &self,
        user_id: Uuid,
        organization_id: Uuid,
        family: Uuid,
        jti: Uuid,
    ) -> Result<(), AppError> {
        sqlx::query(INSERT_REFRESH)
            .bind(jti)
            .bind(organization_id)
            .bind(user_id)
            .bind(family)
            .execute(&self.admin)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "persistir refresh token falló");
                AppError::Internal
            })?;
        Ok(())
    }

    fn sign_access(
        &self,
        user_id: Uuid,
        organization_id: Uuid,
        role: Role,
        now: usize,
    ) -> Result<String, AppError> {
        self.jwt.sign_access(&AccessClaims {
            sub: user_id.to_string(),
            organization_id: organization_id.to_string(),
            role,
            iat: now,
            exp: now + self.config.access_ttl.as_secs() as usize,
        })
    }

    fn sign_refresh(
        &self,
        user_id: Uuid,
        family: Uuid,
        jti: Uuid,
        now: usize,
    ) -> Result<String, AppError> {
        self.jwt.sign_refresh(&RefreshClaims {
            sub: user_id.to_string(),
            jti: jti.to_string(),
            fam: family.to_string(),
            iat: now,
            exp: now + self.config.refresh_ttl.as_secs() as usize,
        })
    }

    async fn revoke_family(&self, family: Uuid) -> Result<(), AppError> {
        sqlx::query(REVOKE_FAMILY)
            .bind(family)
            .execute(&self.admin)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "revoke_family falló");
                AppError::Internal
            })?;
        Ok(())
    }
}

const REVOKE_FAMILY: &str = "UPDATE \"RefreshToken\" SET \"revokedAt\" = now() \
     WHERE \"familyId\" = $1 AND \"revokedAt\" IS NULL";

/// Revoca la familia DENTRO de una transacción en curso.
async fn revoke_family_tx(
    tx: &mut Transaction<'_, Postgres>,
    family: Uuid,
) -> Result<(), AppError> {
    sqlx::query(REVOKE_FAMILY)
        .bind(family)
        .execute(&mut **tx)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "revoke_family (tx) falló");
            AppError::Internal
        })?;
    Ok(())
}

async fn commit(tx: Transaction<'_, Postgres>) -> Result<(), AppError> {
    tx.commit().await.map_err(|e| {
        tracing::error!(error = %e, "commit de refresh falló");
        AppError::Internal
    })
}

/// Segundos Unix actuales. Un reloj anterior a 1970 (patológico) es un fallo
/// interno: NO se devuelve 0 (eso firmaría tokens ya caducados sin avisar).
fn now_secs() -> Result<usize, AppError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as usize)
        .map_err(|_| {
            tracing::error!("reloj del sistema anterior a Unix epoch");
            AppError::Internal
        })
}
