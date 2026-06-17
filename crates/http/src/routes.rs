//! Handlers HTTP. Los de auth replican el contrato del `auth.controller` de
//! NestJS: el access token va en el body; el refresh en una cookie httpOnly
//! (SameSite=Strict, Secure en release) — doc 06 (SEC-20).

use axum::extract::{FromRequest, Request, State};
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use simpletpv_shared::AppError;

use crate::error::ApiError;
use crate::state::AppState;

const REFRESH_COOKIE: &str = "refreshToken";
const REFRESH_MAX_AGE_DAYS: i64 = 7;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    access_token: String,
}

/// Cookie del refresh token: httpOnly (no accesible por JS), SameSite=Strict
/// (bloquea CSRF en /auth/refresh), Secure según config (HTTPS).
fn refresh_cookie(token: String, secure: bool) -> Cookie<'static> {
    Cookie::build((REFRESH_COOKIE, token))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Strict)
        .path("/")
        .max_age(time::Duration::days(REFRESH_MAX_AGE_DAYS))
        .build()
}

/// Cookie de borrado del refresh (logout): MISMOS atributos de seguridad que la
/// de alta para que el navegador la elimine bien y no haya logout-CSRF.
fn removal_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build((REFRESH_COOKIE, ""))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Strict)
        .path("/")
        .build()
}

/// Extractor del body de login que NO filtra el detalle de serde (nombres de
/// campo, posición) en el rechazo: cualquier fallo de parseo → 400 genérico.
pub struct LoginJson(LoginRequest);

impl<S: Send + Sync> FromRequest<S> for LoginJson {
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(body) = Json::<LoginRequest>::from_request(req, state)
            .await
            .map_err(|_| AppError::BadRequest)?;
        Ok(LoginJson(body))
    }
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    LoginJson(req): LoginJson,
) -> Result<(CookieJar, Json<TokenResponse>), ApiError> {
    let pair = state.auth().login(&req.email, &req.password).await?;
    let jar = jar.add(refresh_cookie(pair.refresh_token, state.cookie_secure()));
    Ok((
        jar,
        Json(TokenResponse {
            access_token: pair.access_token,
        }),
    ))
}

pub async fn refresh(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(CookieJar, Json<TokenResponse>), ApiError> {
    let token = jar
        .get(REFRESH_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;
    let pair = state.auth().refresh(&token).await?;
    let jar = jar.add(refresh_cookie(pair.refresh_token, state.cookie_secure()));
    Ok((
        jar,
        Json(TokenResponse {
            access_token: pair.access_token,
        }),
    ))
}

pub async fn logout(State(state): State<AppState>, jar: CookieJar) -> Result<CookieJar, ApiError> {
    if let Some(cookie) = jar.get(REFRESH_COOKIE) {
        state.auth().logout(cookie.value()).await?;
    }
    // Emite un Set-Cookie de borrado (Max-Age=0) con los mismos atributos.
    Ok(jar.remove(removal_cookie(state.cookie_secure())))
}

/// Liveness.
pub async fn health() -> &'static str {
    "ok"
}

/// Readiness: la base de datos responde.
pub async fn ready(State(state): State<AppState>) -> Result<&'static str, StatusCode> {
    sqlx::query("SELECT 1")
        .execute(state.db())
        .await
        .map(|_| "ready")
        .map_err(|e| {
            tracing::error!(error = %e, "readiness check falló");
            StatusCode::SERVICE_UNAVAILABLE
        })
}
