//! Middleware de auditoría (#156, SEC-22) — port del `AuditInterceptor` global de
//! NestJS. Tras CADA mutación exitosa (POST/PUT/PATCH/DELETE con respuesta 2xx de
//! un usuario autenticado) registra una fila en `AuditLog` (`action`, `entity`,
//! `entityId`, `userId`, `organizationId`) bajo el contexto de tenant (RLS).
//!
//! Best-effort: la mutación ya hizo commit, así que un fallo de auditoría NO tumba
//! la respuesta — pero NO pasa en silencio (se loguea como error, SEC-22). El
//! usuario se identifica reverificando el access token (firma); si no hay token
//! válido no se audita (las rutas públicas no mutan datos de tenant).

use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::http::Method;
use axum::middleware::Next;
use axum::response::Response;
use simpletpv_db::with_tenant_tx;
use uuid::Uuid;

use crate::state::AppState;

fn is_mutation(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

/// Middleware global de auditoría. Se monta como capa en `build_router`.
pub async fn record(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let method = req.method().clone();
    // Solo las mutaciones se auditan: evita reverificar el token en lecturas.
    let claims = if is_mutation(&method) {
        req.headers()
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .and_then(|t| state.auth().verify_access_token(t).ok())
    } else {
        None
    };
    let path = req.uri().path().to_owned();

    let res = next.run(req).await;

    // Solo se audita la mutación que tuvo éxito (2xx) y con usuario identificado.
    if let Some(claims) = claims {
        if res.status().is_success() {
            if let Ok(org) = Uuid::parse_str(&claims.organization_id) {
                let user_id = Uuid::parse_str(&claims.sub).ok();
                // `entity` = 1er segmento de ruta, `entityId` = 2º (paridad NestJS).
                let mut segs = path.split('/').filter(|s| !s.is_empty());
                let entity = segs.next().unwrap_or("unknown").to_owned();
                let entity_id = segs.next().map(str::to_owned);
                let action = method.as_str().to_owned();
                let db = state.db().clone();
                let entity_log = entity.clone(); // para el log si la auditoría falla

                let result: Result<(), simpletpv_shared::AppError> =
                    with_tenant_tx(&db, org, async move |tx, _| {
                        sqlx::query(
                            r#"INSERT INTO "AuditLog"
                                 (id, "organizationId", "userId", action, entity, "entityId")
                               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)"#,
                        )
                        .bind(org)
                        .bind(user_id)
                        .bind(&action)
                        .bind(&entity)
                        .bind(&entity_id)
                        .execute(&mut **tx)
                        .await
                        .map(|_| ())
                    })
                    .await;

                if let Err(e) = result {
                    tracing::error!(
                        error = %e, method = %method, entity = %entity_log,
                        "fallo al escribir audit log (SEC-22)"
                    );
                }
            }
        }
    }
    res
}
