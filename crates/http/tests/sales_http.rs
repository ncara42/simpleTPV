//! Integración HTTP de ventas (`/sales`, slice 1) vía `tower::oneshot`: crear,
//! consultar por ticket, listar y rechazo sin sesión. Crea una tienda + caja
//! abierta propias (vía pool admin) para aislarse.

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

fn auth_config() -> AuthConfig {
    AuthConfig {
        access_secret: SecretString::from("test-access-secret".to_owned()),
        refresh_secret: SecretString::from("test-refresh-secret".to_owned()),
        access_ttl: Duration::from_secs(900),
        refresh_ttl: Duration::from_secs(604_800),
    }
}

async fn build() -> (Router, PgPool) {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let db = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let user_state = UserStateService::new(DbUserStateLookup::new(admin.clone()));
    let auth = AuthService::new(admin.clone(), auth_config());
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

fn json(body: &str) -> serde_json::Value {
    serde_json::from_str(body).expect("body JSON")
}

async fn login(app: &Router, email: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header(CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "10.0.0.3")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{PASSWORD}"}}"#
        )))
        .unwrap();
    let (st, _, body) = send(app, req).await;
    assert_eq!(st, StatusCode::OK, "login {email}: {body}");
    json(&body)["accessToken"].as_str().unwrap().to_owned()
}

fn get(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
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

async fn create_product(app: &Router, token: &str) -> String {
    let body = format!(r#"{{"name":"SALEH-{}","salePrice":1.0}}"#, Uuid::new_v4());
    let (st, _, b) = send(app, body_req("POST", "/products", Some(token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    json(&b)["id"].as_str().unwrap().to_owned()
}

/// Crea una tienda con caja abierta y devuelve su id (vía pool admin).
async fn store_with_open_session(admin: &PgPool) -> Uuid {
    let (org, user): (Uuid, Uuid) = {
        let org: Uuid =
            sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
                .fetch_one(admin)
                .await
                .unwrap();
        let user: Uuid = sqlx::query_scalar(
            r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
        )
        .bind(org)
        .fetch_one(admin)
        .await
        .unwrap();
        (org, user)
    };
    let store = Uuid::new_v4();
    let code = format!("H{}", &store.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(store)
    .bind(org)
    .bind(format!("Tienda {code}"))
    .bind(&code)
    .execute(admin)
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO "CashSession" (id, "organizationId", "storeId", "userId", "openingAmount", status)
           VALUES ($1, $2, $3, $4, 0, 'OPEN'::"CashSessionStatus")"#,
    )
    .bind(Uuid::new_v4())
    .bind(org)
    .bind(store)
    .bind(user)
    .execute(admin)
    .await
    .unwrap();
    store
}

/// Crea una tienda SIN caja abierta y devuelve su id. Las facturas a crédito (B2B)
/// se emiten desde el backoffice, que no tiene caja: no exigen sesión abierta.
async fn store_without_session(admin: &PgPool) -> Uuid {
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(admin)
        .await
        .unwrap();
    let store = Uuid::new_v4();
    let code = format!("H{}", &store.simple().to_string()[..8]);
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(store)
    .bind(org)
    .bind(format!("Tienda {code}"))
    .bind(&code)
    .execute(admin)
    .await
    .unwrap();
    store
}

async fn cleanup(admin: &PgPool, store: Uuid, product: &str) {
    let pid = Uuid::parse_str(product).unwrap();
    for sql in [
        r#"DELETE FROM "StockMovement" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockAlert" WHERE "storeId" = $1"#,
        r#"DELETE FROM "StockBatch" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Stock" WHERE "storeId" = $1"#,
        r#"DELETE FROM "SaleLine" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "storeId" = $1)"#,
        r#"DELETE FROM "Sale" WHERE "storeId" = $1"#,
        r#"DELETE FROM "CashSession" WHERE "storeId" = $1"#,
        r#"DELETE FROM "Store" WHERE id = $1"#,
    ] {
        sqlx::query(sql).bind(store).execute(admin).await.unwrap();
    }
    sqlx::query(r#"DELETE FROM "Product" WHERE id = $1"#)
        .bind(pid)
        .execute(admin)
        .await
        .unwrap();
}

#[tokio::test]
async fn create_and_query_sale() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = store_with_open_session(&admin).await;
    let product = create_product(&app, &token).await;

    // Crear venta (CARD, 2 uds × 1.00 = 2.00) → 201.
    let body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"CARD","lines":[{{"productId":"{product}","qty":2}}]}}"#
    );
    let (st, _, b) = send(&app, body_req("POST", "/sales", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    let sale = json(&b);
    assert_eq!(sale["total"], "2");
    assert_eq!(sale["lines"].as_array().unwrap().len(), 1);
    let ticket = sale["ticketNumber"].as_str().unwrap().to_owned();

    // Consultar por ticket.
    let (stt, _, bt) = send(&app, get(&format!("/sales/by-ticket/{ticket}"), &token)).await;
    assert_eq!(stt, StatusCode::OK, "{bt}");
    assert_eq!(json(&bt)["id"], sale["id"]);

    // Listar por tienda → contiene la venta.
    let (stl, _, bl) = send(&app, get(&format!("/sales?storeId={store}"), &token)).await;
    assert_eq!(stl, StatusCode::OK, "{bl}");
    let page = json(&bl);
    assert!(page["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"] == sale["id"]));
    assert!(page["totalItems"].as_i64().unwrap() >= 1);

    cleanup(&admin, store, &product).await;
}

#[tokio::test]
async fn unauthenticated_create_is_rejected() {
    let (app, _admin) = build().await;
    let body =
        r#"{"storeId":"00000000-0000-0000-0000-000000000000","paymentMethod":"CARD","lines":[]}"#;
    let (st, _, _) = send(&app, body_req("POST", "/sales", None, body)).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn ticket_and_receipt_endpoints() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = store_with_open_session(&admin).await;
    let product = create_product(&app, &token).await;

    let body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"CASH","cashGiven":10,"lines":[{{"productId":"{product}","qty":2}}]}}"#
    );
    let (st, _, b) = send(&app, body_req("POST", "/sales", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    let sale = json(&b);
    let id = sale["id"].as_str().unwrap().to_owned();

    // GET /sales/{id}/ticket → 200 JSON con desglose de IVA.
    let (stt, _, bt) = send(&app, get(&format!("/sales/{id}/ticket"), &token)).await;
    assert_eq!(stt, StatusCode::OK, "{bt}");
    let t = json(&bt);
    assert_eq!(t["ticketNumber"], sale["ticketNumber"]);
    assert!(!t["taxBreakdown"].as_array().unwrap().is_empty());

    // GET /sales/{id}/receipt → 200 text/html con CSP.
    let (str_, hr, br) = send(&app, get(&format!("/sales/{id}/receipt"), &token)).await;
    assert_eq!(str_, StatusCode::OK);
    assert!(hr
        .get(CONTENT_TYPE)
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("text/html"));
    assert!(hr.contains_key("content-security-policy"));
    assert!(br.contains("<!DOCTYPE html>"));

    // 404 para una venta inexistente.
    let (s404, _, _) = send(
        &app,
        get(&format!("/sales/{}/ticket", Uuid::new_v4()), &token),
    )
    .await;
    assert_eq!(s404, StatusCode::NOT_FOUND);

    cleanup(&admin, store, &product).await;
}

#[tokio::test]
async fn export_endpoints_requieren_admin_o_manager() {
    let (app, _admin) = build().await;
    let clerk = login(&app, "clerk@org1.test").await;
    let id = Uuid::new_v4();
    // POST export, GET estado y GET descarga → 403 para CLERK (datos de central).
    let (s1, _, _) = send(&app, body_req("POST", "/sales/export", Some(&clerk), "{}")).await;
    assert_eq!(s1, StatusCode::FORBIDDEN);
    let (s2, _, _) = send(&app, get(&format!("/sales/export/{id}"), &clerk)).await;
    assert_eq!(s2, StatusCode::FORBIDDEN);
    let (s3, _, _) = send(&app, get(&format!("/sales/export/{id}/download"), &clerk)).await;
    assert_eq!(s3, StatusCode::FORBIDDEN);
}

/// `POST /sales/export` lee los filtros del CUERPO JSON (paridad NestJS `@Body`),
/// no de la query: un `status` inválido en el body se valida → 400. Si el endpoint
/// leyera de la query (ignorando el body), esto sería 202. Fija la regresión que
/// detectó la auditoría de paridad.
#[tokio::test]
async fn export_valida_filtros_del_cuerpo() {
    let (app, _admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let (st, _, _) = send(
        &app,
        body_req(
            "POST",
            "/sales/export",
            Some(&token),
            r#"{"status":"INVALID"}"#,
        ),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "el status inválido del cuerpo se valida (filtro leído del body, no de la query)"
    );
}

#[tokio::test]
async fn ticket_requires_auth() {
    let (app, _admin) = build().await;
    let req = Request::builder()
        .uri(format!("/sales/{}/ticket", Uuid::new_v4()))
        .body(Body::empty())
        .unwrap();
    let (st, _, _) = send(&app, req).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

/// `POST /sales` con `channel:"B2B"` + `creditDueDate` y SIN caja abierta para esa
/// tienda → 201 con `paymentStatus:"PENDING"`, `dueDate` fijada y `paidAt` nulo. El
/// gate de caja no aplica a la facturación a crédito.
#[tokio::test]
async fn crea_factura_credito_b2b_sin_caja_devuelve_pendiente() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = store_without_session(&admin).await; // SIN caja abierta
    let product = create_product(&app, &token).await;

    let body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"TRANSFER","channel":"B2B","creditDueDate":"2999-12-31","lines":[{{"productId":"{product}","qty":3}}]}}"#
    );
    let (st, _, b) = send(&app, body_req("POST", "/sales", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    let sale = json(&b);
    assert_eq!(sale["paymentStatus"], "PENDING");
    assert_eq!(sale["channel"], "B2B");
    assert_eq!(sale["dueDate"], "2999-12-31");
    assert!(
        sale["paidAt"].is_null(),
        "una factura a crédito nace sin paidAt"
    );

    cleanup(&admin, store, &product).await;
}

/// `POST /sales/:id/collect`: 200 + `paymentStatus:"PAID"` para ADMIN sobre una
/// factura PENDING; 403 para CLERK (la ruta exige ADMIN/MANAGER); 404 para un id
/// inexistente.
#[tokio::test]
async fn collect_cobra_factura_admin_y_restringe_clerk() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let clerk = login(&app, "clerk@org1.test").await;
    let store = store_without_session(&admin).await;
    let product = create_product(&app, &token).await;

    // Factura a crédito B2B (sin caja) → 201 PENDING.
    let body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"TRANSFER","channel":"B2B","creditDueDate":"2999-12-31","lines":[{{"productId":"{product}","qty":1}}]}}"#
    );
    let (st, _, b) = send(&app, body_req("POST", "/sales", Some(&token), &body)).await;
    assert_eq!(st, StatusCode::CREATED, "{b}");
    let id = json(&b)["id"].as_str().unwrap().to_owned();

    // CLERK no puede cobrar → 403 (chequeo de rol antes de tocar la BD).
    let (s403, _, _) = send(
        &app,
        body_req("POST", &format!("/sales/{id}/collect"), Some(&clerk), "{}"),
    )
    .await;
    assert_eq!(s403, StatusCode::FORBIDDEN);

    // ADMIN cobra → 200 + paymentStatus PAID.
    let (s200, _, b200) = send(
        &app,
        body_req("POST", &format!("/sales/{id}/collect"), Some(&token), "{}"),
    )
    .await;
    assert_eq!(s200, StatusCode::OK, "{b200}");
    assert_eq!(json(&b200)["paymentStatus"], "PAID");

    // Id inexistente → 404.
    let (s404, _, _) = send(
        &app,
        body_req(
            "POST",
            &format!("/sales/{}/collect", Uuid::new_v4()),
            Some(&token),
            "{}",
        ),
    )
    .await;
    assert_eq!(s404, StatusCode::NOT_FOUND);

    cleanup(&admin, store, &product).await;
}

/// `GET /sales?paymentStatus=OVERDUE` → 200 y SOLO las filas vencidas (PENDING +
/// vencimiento pasado). Una factura a crédito con `dueDate` futura (pendiente pero no
/// vencida) NO aparece.
#[tokio::test]
async fn lista_filtra_estado_de_cobro_vencido() {
    let (app, admin) = build().await;
    let token = login(&app, "admin@org1.test").await;
    let store = store_without_session(&admin).await;
    let product = create_product(&app, &token).await;

    // Vencida: dueDate en el pasado.
    let overdue_body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"TRANSFER","channel":"B2B","creditDueDate":"2000-01-01","lines":[{{"productId":"{product}","qty":1}}]}}"#
    );
    let (so, _, bo) = send(
        &app,
        body_req("POST", "/sales", Some(&token), &overdue_body),
    )
    .await;
    assert_eq!(so, StatusCode::CREATED, "{bo}");
    let overdue_id = json(&bo)["id"].as_str().unwrap().to_owned();

    // Pendiente NO vencida: dueDate en el futuro.
    let future_body = format!(
        r#"{{"storeId":"{store}","paymentMethod":"TRANSFER","channel":"B2B","creditDueDate":"2999-12-31","lines":[{{"productId":"{product}","qty":1}}]}}"#
    );
    let (sf, _, bf) = send(&app, body_req("POST", "/sales", Some(&token), &future_body)).await;
    assert_eq!(sf, StatusCode::CREATED, "{bf}");
    let future_id = json(&bf)["id"].as_str().unwrap().to_owned();

    // GET acotado a la tienda + paymentStatus=OVERDUE → solo la vencida.
    let (st, _, bl) = send(
        &app,
        get(
            &format!("/sales?storeId={store}&paymentStatus=OVERDUE"),
            &token,
        ),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{bl}");
    let page = json(&bl);
    let items = page["items"].as_array().unwrap();
    assert!(
        items.iter().any(|s| s["id"] == overdue_id),
        "la vencida aparece"
    );
    assert!(
        !items.iter().any(|s| s["id"] == future_id),
        "la pendiente no vencida no aparece"
    );
    // Vencida = PENDING + vencimiento pasado: toda fila devuelta es PENDING.
    assert!(items.iter().all(|s| s["paymentStatus"] == "PENDING"));

    cleanup(&admin, store, &product).await;
}
