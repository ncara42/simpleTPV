//! Documento OpenAPI (#155) servido en `GET /openapi.json`. Enfoque code-first
//! con utoipa. Cubre de momento un conjunto representativo (salud + login) con
//! el esquema de seguridad Bearer JWT; el resto de rutas se anotan de forma
//! incremental con `#[utoipa::path]` y se añaden a `paths(...)`.

use axum::Json;
use serde::Serialize;
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi, ToSchema};

/// Cuerpo de `POST /auth/login` (esquema de documentación).
#[derive(ToSchema, Serialize)]
#[schema(rename_all = "camelCase")]
pub struct LoginRequest {
    #[schema(example = "user@example.com")]
    pub email: String,
    #[schema(example = "<password>")]
    pub password: String,
}

/// Respuesta de login: access token JWT (el refresh viaja en cookie httpOnly).
#[derive(ToSchema, Serialize)]
#[schema(rename_all = "camelCase")]
pub struct TokenResponseDoc {
    #[schema(example = "eyJhbGciOiJIUzI1NiJ9...")]
    pub access_token: String,
}

/// Añade el esquema de seguridad Bearer JWT a los componentes del documento.
struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "bearer_jwt",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .description(Some(
                        "Access token JWT en `Authorization: Bearer <token>` (de /auth/login).",
                    ))
                    .build(),
            ),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "simpleTPV API",
        description = "API del TPV multitienda (backend Rust, migración #158). \
            Multi-tenant por RLS; el organizationId viaja dentro del JWT."
    ),
    paths(crate::routes::login, crate::routes::health, crate::routes::ready),
    components(schemas(LoginRequest, TokenResponseDoc)),
    modifiers(&SecurityAddon),
    tags(
        (name = "auth", description = "Autenticación y sesión"),
        (name = "health", description = "Sondas de salud/preparación")
    )
)]
pub struct ApiDoc;

/// `GET /openapi.json` — documento OpenAPI 3.1 (público, sin auth).
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
