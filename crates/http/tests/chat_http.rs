//! Integración HTTP del chatbot agente (#188, F6). Verifica la capa HTTP sin
//! proveedor LLM real (`ai = None`): autorización por rol (solo ADMIN/MANAGER),
//! el guard de `ai=None` en `/chat/stream`, el filtrado de `/chat/models` por
//! providers configurados y el ciclo de vida de conversaciones (listar, mensajes,
//! prune con canvasOpsToUndo, borrado) con filtrado defense-in-depth por usuario.

use std::time::Duration;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use secrecy::SecretString;
use simpletpv_auth::{AuthConfig, AuthService, DbUserStateLookup, UserStateService};
use simpletpv_http::{build_router, AppState};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";
const PASSWORD: &str = "password123";

async fn pool(env: &str, default: &str) -> PgPool {
    let url = std::env::var(env).unwrap_or_else(|_| default.to_owned());
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

/// Construye el router con `ai = None` (sin claves LLM) y devuelve también el
/// pool admin (BYPASSRLS) para sembrar/limpiar datos de chat directamente.
async fn build() -> (Router, PgPool) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(
        admin.clone(),
        AuthConfig {
            access_secret: SecretString::from("test-access-secret".to_owned()),
            refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
            access_ttl: Duration::from_secs(900),
            refresh_ttl: Duration::from_secs(604_800),
        },
    );
    let state = AppState::new(auth, user_state, db, admin.clone(), false, Vec::new(), None, None);
    (build_router(state), admin)
}

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, HeaderMap, String) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, headers, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.21")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{PASSWORD}"}}"#
        )))
        .unwrap();
    let (st, _, body) = send(app, req).await;
    assert_eq!(st, StatusCode::OK, "login {email}: {body}");
    serde_json::from_str::<serde_json::Value>(&body).unwrap()["accessToken"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn get(uri: &str, token: Option<&str>) -> Request<Body> {
    let mut b = Request::builder().uri(uri);
    if let Some(t) = token {
        b = b.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    b.body(Body::empty()).unwrap()
}

fn body_req(method: &str, uri: &str, token: Option<&str>, json_body: &str) -> Request<Body> {
    let mut b = Request::builder()
        .method(method)
        .uri(uri)
        .header(CONTENT_TYPE, "application/json");
    if let Some(t) = token {
        b = b.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    b.body(Body::from(json_body.to_owned())).unwrap()
}

/// Identidad (org, userId) del usuario de pruebas, vía el pool admin.
async fn ids(admin: &PgPool, email: &str) -> (Uuid, Uuid) {
    let row: (Uuid, Uuid) =
        sqlx::query_as(r#"SELECT "organizationId", id FROM "User" WHERE email = $1"#)
            .bind(email)
            .fetch_one(admin)
            .await
            .expect("usuario de pruebas presente");
    row
}

/// Siembra una conversación con un mensaje de assistant que contiene un
/// add_widget (inversible) y un clear_canvas (no inversible). Devuelve los ids.
async fn seed_conversation(admin: &PgPool, org: Uuid, user: Uuid) -> (Uuid, Uuid) {
    let conv_id = Uuid::new_v4();
    let pivot_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "chat_conversation" ("id","organizationId","userId","title","createdAt","updatedAt")
           VALUES ($1,$2,$3,'Sembrada',NOW(),NOW())"#,
    )
    .bind(conv_id).bind(org).bind(user).execute(admin).await.unwrap();
    sqlx::query(
        r#"INSERT INTO "chat_message" ("id","conversationId","organizationId","role","content","createdAt")
           VALUES ($1,$2,$3,'user',$4,NOW())"#,
    )
    .bind(pivot_id).bind(conv_id).bind(org)
    .bind(serde_json::json!([{ "type": "text", "text": "hola" }]))
    .execute(admin).await.unwrap();
    sqlx::query(
        r#"INSERT INTO "chat_message" ("id","conversationId","organizationId","role","content","toolCalls","createdAt")
           VALUES ($1,$2,$3,'assistant',$4,$5, NOW() + interval '10 milliseconds')"#,
    )
    .bind(Uuid::new_v4()).bind(conv_id).bind(org)
    .bind(serde_json::json!([{ "type": "text", "text": "añado el widget" }]))
    .bind(serde_json::json!([
        { "name": "add_widget", "args": { "element_id": "e1", "widget_id": "kpi-today" } },
        { "name": "clear_canvas", "args": {} }
    ]))
    .execute(admin).await.unwrap();
    (conv_id, pivot_id)
}

async fn cleanup(admin: &PgPool, conv: Uuid) {
    for sql in [
        r#"DELETE FROM "ai_usage" WHERE "conversationId" = $1"#,
        r#"DELETE FROM "chat_message" WHERE "conversationId" = $1"#,
        r#"DELETE FROM "chat_conversation" WHERE id = $1"#,
    ] {
        sqlx::query(sql).bind(conv).execute(admin).await.unwrap();
    }
}

#[tokio::test]
async fn chat_sin_sesion_es_401() {
    let (app, _admin) = build().await;
    let (st, _, _) = send(&app, get("/chat/conversations", None)).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn chat_clerk_recibe_403() {
    let (app, _admin) = build().await;
    let token = login(&app, "clerk@org1.test").await;
    let (st, _, _) = send(&app, get("/chat/conversations", Some(&token))).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "el cajero no accede al chat");
}

#[tokio::test]
async fn stream_sin_provider_configurado_es_400() {
    // Con ai=None el endpoint corta limpio (400), no 500 ni panic.
    let (app, _admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let req = body_req(
        "POST",
        "/chat/stream",
        Some(&token),
        r#"{"message":"hola","model":"gpt-4.1","effort":"low"}"#,
    );
    let (st, _, _) = send(&app, req).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn models_sin_claves_devuelve_lista_vacia() {
    let (app, _admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let (st, _, body) = send(&app, get("/chat/models", Some(&token))).await;
    assert_eq!(st, StatusCode::OK);
    let models: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(
        models.as_array().unwrap().len(),
        0,
        "sin claves de provider no se ofrece ningún modelo"
    );
}

#[tokio::test]
async fn ciclo_de_vida_de_conversacion_via_http() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let (org, user) = ids(&admin, "admin@org1.test").await;
    let (conv_id, pivot_id) = seed_conversation(&admin, org, user).await;

    // GET /chat/conversations — incluye la sembrada (filtrada por userId).
    let (st, _, body) = send(&app, get("/chat/conversations", Some(&token))).await;
    assert_eq!(st, StatusCode::OK);
    let convs: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(
        convs
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["id"] == conv_id.to_string()),
        "la conversación sembrada aparece en el listado"
    );

    // GET messages — dos mensajes en orden.
    let (st, _, body) = send(
        &app,
        get(
            &format!("/chat/conversations/{conv_id}/messages"),
            Some(&token),
        ),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let msgs: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(msgs.as_array().unwrap().len(), 2);

    // DELETE .../after/{pivot} — devuelve solo el add_widget como inversible.
    let (st, _, body) = send(
        &app,
        body_req(
            "DELETE",
            &format!("/chat/conversations/{conv_id}/after/{pivot_id}"),
            Some(&token),
            "",
        ),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let prune: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(prune["pruned"], 1);
    let undo = prune["canvasOpsToUndo"].as_array().unwrap();
    assert_eq!(undo.len(), 1, "solo add_widget es inversible");
    assert_eq!(undo[0]["op"], "add_widget");
    assert_eq!(undo[0]["elementId"], "e1");

    // DELETE conversation → 204.
    let (st, _, _) = send(
        &app,
        body_req(
            "DELETE",
            &format!("/chat/conversations/{conv_id}"),
            Some(&token),
            "",
        ),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    cleanup(&admin, conv_id).await;
}

#[tokio::test]
async fn conversacion_de_otro_usuario_no_aparece_en_el_listado() {
    // Defense-in-depth: las conversaciones se filtran por userId, no solo por org.
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let (org, _admin_user) = ids(&admin, "admin@org1.test").await;
    let (_org2, manager_user) = ids(&admin, "manager@org1.test").await;

    // Conversación del manager (misma org) sembrada directamente.
    let (conv_id, _) = seed_conversation(&admin, org, manager_user).await;

    let (st, _, body) = send(&app, get("/chat/conversations", Some(&token))).await;
    assert_eq!(st, StatusCode::OK);
    let convs: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(
        !convs
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["id"] == conv_id.to_string()),
        "el admin no ve la conversación del manager pese a compartir org"
    );

    cleanup(&admin, conv_id).await;
}
