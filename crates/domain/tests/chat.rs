//! Integración del chat/IA contra Postgres con RLS. Cubre el CRUD de
//! conversaciones y mensajes, el aislamiento por tenant, la extracción de
//! canvas_ops a deshacer (`prune_after`), el registro de gasto (`ai_usage`,
//! incluido el flag `aborted`) y el despachador de tools (redacción de campos
//! sensibles + filtrado por rol). Requiere el Postgres dev sembrado.

use std::time::Duration;

use rust_decimal::Decimal;
use simpletpv_domain::chat::{self, InsertConversation, InsertMessage, RecordUsageInput};
use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_APP_URL: &str = "postgres://app:app_dev_password@localhost:5434/simpletpv";
const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

async fn pool(env: &str, default: &str) -> PgPool {
    let url = std::env::var(env).unwrap_or_else(|_| default.to_owned());
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

async fn org_id(admin: &PgPool, nif: &str) -> Uuid {
    sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = $1"#)
        .bind(nif)
        .fetch_one(admin)
        .await
        .expect("seed: organización presente")
}

async fn a_user(admin: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar(
        r#"SELECT id FROM "User" WHERE "organizationId" = $1 ORDER BY email LIMIT 1"#,
    )
    .bind(org)
    .fetch_one(admin)
    .await
    .expect("seed: usuario presente")
}

/// Borra todo el rastro de una conversación (mensajes + usage + conversación).
async fn cleanup_conversation(admin: &PgPool, conv: Uuid) {
    for sql in [
        r#"DELETE FROM "ai_usage" WHERE "conversationId" = $1"#,
        r#"DELETE FROM "chat_message" WHERE "conversationId" = $1"#,
        r#"DELETE FROM "chat_conversation" WHERE id = $1"#,
    ] {
        sqlx::query(sql)
            .bind(conv)
            .execute(admin)
            .await
            .expect("limpiar");
    }
}

fn text_content(s: &str) -> serde_json::Value {
    serde_json::json!([{ "type": "text", "text": s }])
}

#[tokio::test]
async fn conversaciones_se_crean_listan_y_aislan_por_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let org2 = org_id(&admin, "B22222222").await;
    let user = a_user(&admin, org1).await;

    let conv_id = Uuid::new_v4();
    let conv = chat::create_conversation(
        &app,
        org1,
        InsertConversation {
            id: conv_id,
            organization_id: org1,
            user_id: user,
            title: Some("Ventas del mes".into()),
        },
    )
    .await
    .expect("crear conversación");
    assert_eq!(conv.id, conv_id);
    assert_eq!(conv.title.as_deref(), Some("Ventas del mes"));

    // Visible en org1 para su usuario.
    let list = chat::list_conversations(&app, org1, user).await.unwrap();
    assert!(list.iter().any(|c| c.id == conv_id));

    // org2 NO ve la conversación de org1 (RLS).
    let got = chat::get_conversation(&app, org2, conv_id).await;
    assert!(
        got.is_err(),
        "org2 no debe poder leer la conversación de org1"
    );

    chat::delete_conversation(&app, org1, conv_id)
        .await
        .unwrap();
    assert!(chat::get_conversation(&app, org1, conv_id).await.is_err());

    cleanup_conversation(&admin, conv_id).await;
}

#[tokio::test]
async fn mensajes_se_persisten_y_recuperan_en_orden() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let user = a_user(&admin, org1).await;

    let conv_id = Uuid::new_v4();
    chat::create_conversation(
        &app,
        org1,
        InsertConversation {
            id: conv_id,
            organization_id: org1,
            user_id: user,
            title: None,
        },
    )
    .await
    .unwrap();

    chat::append_message(
        &app,
        org1,
        InsertMessage {
            id: Uuid::new_v4(),
            conversation_id: conv_id,
            organization_id: org1,
            role: "user".into(),
            content: text_content("¿ventas de hoy?"),
            tool_calls: None,
            tool_results: None,
        },
    )
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    chat::append_message(
        &app,
        org1,
        InsertMessage {
            id: Uuid::new_v4(),
            conversation_id: conv_id,
            organization_id: org1,
            role: "assistant".into(),
            content: text_content("Hoy llevas 1.200 €."),
            tool_calls: Some(serde_json::json!([
                { "name": "sales_kpis", "args": { "period": "today" } }
            ])),
            tool_results: Some(serde_json::json!([
                { "toolCallId": "tc1", "content": { "total": 1200 } }
            ])),
        },
    )
    .await
    .unwrap();

    let msgs = chat::get_messages(&app, org1, conv_id).await.unwrap();
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0].role, "user");
    assert_eq!(msgs[1].role, "assistant");
    assert!(msgs[1].tool_calls.is_some(), "los toolCalls se persisten");
    assert!(
        msgs[1].tool_results.is_some(),
        "los toolResults se persisten"
    );

    cleanup_conversation(&admin, conv_id).await;
}

#[tokio::test]
async fn prune_after_devuelve_solo_add_ops_inversibles() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let user = a_user(&admin, org1).await;

    let conv_id = Uuid::new_v4();
    chat::create_conversation(
        &app,
        org1,
        InsertConversation {
            id: conv_id,
            organization_id: org1,
            user_id: user,
            title: None,
        },
    )
    .await
    .unwrap();

    // Mensaje pivote (sobre el que truncamos): no se borra.
    let pivot_id = Uuid::new_v4();
    chat::append_message(
        &app,
        org1,
        InsertMessage {
            id: pivot_id,
            conversation_id: conv_id,
            organization_id: org1,
            role: "user".into(),
            content: text_content("primer mensaje"),
            tool_calls: None,
            tool_results: None,
        },
    )
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;

    // Turno del assistant con un add_widget (inversible) y un clear_canvas (NO inversible).
    chat::append_message(
        &app,
        org1,
        InsertMessage {
            id: Uuid::new_v4(),
            conversation_id: conv_id,
            organization_id: org1,
            role: "assistant".into(),
            content: text_content("añado el widget"),
            tool_calls: Some(serde_json::json!([
                { "name": "add_widget", "args": { "element_id": "e1", "widget_id": "dash-bars" } },
                { "name": "clear_canvas", "args": {} },
                { "name": "remove_element", "args": { "element_id": "old" } }
            ])),
            tool_results: None,
        },
    )
    .await
    .unwrap();

    let result = chat::prune_after(&app, org1, conv_id, pivot_id)
        .await
        .unwrap();
    assert_eq!(result.pruned, 1, "se borra el mensaje posterior al pivote");
    // Solo el add_widget es inversible; clear_canvas y remove_element se ignoran.
    assert_eq!(result.canvas_ops_to_undo.len(), 1);
    assert_eq!(result.canvas_ops_to_undo[0].op, "add_widget");
    assert_eq!(
        result.canvas_ops_to_undo[0].element_id.as_deref(),
        Some("e1")
    );

    // El pivote sigue vivo.
    let msgs = chat::get_messages(&app, org1, conv_id).await.unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].id, pivot_id);

    cleanup_conversation(&admin, conv_id).await;
}

#[tokio::test]
async fn ai_usage_registra_coste_y_distingue_turnos_abortados() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;
    let user = a_user(&admin, org1).await;

    let conv_id = Uuid::new_v4();
    chat::create_conversation(
        &app,
        org1,
        InsertConversation {
            id: conv_id,
            organization_id: org1,
            user_id: user,
            title: None,
        },
    )
    .await
    .unwrap();

    // Turno normal.
    chat::record_usage(
        &app,
        org1,
        RecordUsageInput {
            id: Uuid::new_v4(),
            organization_id: org1,
            user_id: user,
            conversation_id: Some(conv_id),
            provider: "openai".into(),
            model: "gpt-4.1".into(),
            input_tokens: 1000,
            output_tokens: 500,
            cost_eur: Decimal::new(57, 4), // 0.0057
            aborted: false,
        },
    )
    .await
    .unwrap();

    // Turno abortado (Stop): tokens estimados.
    chat::record_usage(
        &app,
        org1,
        RecordUsageInput {
            id: Uuid::new_v4(),
            organization_id: org1,
            user_id: user,
            conversation_id: Some(conv_id),
            provider: "openai".into(),
            model: "gpt-4.1".into(),
            input_tokens: 200,
            output_tokens: 100,
            cost_eur: Decimal::new(11, 4), // 0.0011
            aborted: true,
        },
    )
    .await
    .unwrap();

    // El contador por conversación suma ambos turnos (restaurable al recargar).
    let usage = chat::get_conversation_usage(&app, org1, conv_id)
        .await
        .unwrap();
    assert_eq!(usage.turns, 2);
    assert_eq!(usage.total.input_tokens, 1200);
    assert_eq!(usage.total.output_tokens, 600);
    assert_eq!(usage.total.cost_eur, "0.0068");

    // El flag aborted queda persistido para distinguir estimación de medición real.
    let aborted_count: i64 = sqlx::query_scalar(
        r#"SELECT count(*) FROM "ai_usage" WHERE "conversationId"=$1 AND aborted=true"#,
    )
    .bind(conv_id)
    .fetch_one(&admin)
    .await
    .unwrap();
    assert_eq!(aborted_count, 1);

    cleanup_conversation(&admin, conv_id).await;
}

#[tokio::test]
async fn dispatch_tool_users_list_redacta_campos_sensibles_y_exige_admin() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;

    // Como Manager (is_admin=false): la tool admin-only no se ejecuta.
    let denied = chat::dispatch_tool(&app, org1, "users_list", &serde_json::json!({}), false)
        .await
        .unwrap();
    assert!(
        denied.get("error").is_some(),
        "users_list no debe ejecutarse para no-admin"
    );

    // Como Admin: devuelve usuarios pero SIN email/pinHash/passwordHash.
    let allowed = chat::dispatch_tool(&app, org1, "users_list", &serde_json::json!({}), true)
        .await
        .unwrap();
    let arr = allowed.as_array().expect("users_list devuelve un array");
    assert!(!arr.is_empty(), "el seed tiene usuarios en org1");
    for u in arr {
        assert!(u.get("email").is_none(), "email debe estar redactado");
        assert!(u.get("pinHash").is_none(), "pinHash debe estar redactado");
        assert!(
            u.get("passwordHash").is_none(),
            "passwordHash debe estar redactado"
        );
        // Campos no sensibles sí presentes.
        assert!(u.get("id").is_some());
        assert!(u.get("role").is_some());
    }
}

#[tokio::test]
async fn dispatch_tool_desconocida_devuelve_error_controlado() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;

    let out = chat::dispatch_tool(&app, org1, "tool_inventada", &serde_json::json!({}), true)
        .await
        .unwrap();
    assert!(
        out.get("error").is_some(),
        "una tool desconocida devuelve error, no panic"
    );
}

#[tokio::test]
async fn dispatch_tool_sales_kpis_devuelve_datos_del_tenant() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org1 = org_id(&admin, "B11111111").await;

    let out = chat::dispatch_tool(
        &app,
        org1,
        "sales_kpis",
        &serde_json::json!({ "period": "month" }),
        false,
    )
    .await
    .expect("sales_kpis no debe fallar");
    // Es un objeto de KPIs (no el envoltorio de error).
    assert!(out.is_object());
    assert!(out.get("error").is_none());
}
