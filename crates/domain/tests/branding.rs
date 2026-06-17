//! Integración de marca corporativa (#154, U-08) contra Postgres con RLS:
//! lectura, fijar color/logo, restaurar a null y rechazo de SVG malicioso.

use std::time::Duration;

use simpletpv_domain::branding::{service, UpdateBranding};
use simpletpv_shared::AppError;
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

async fn org_id(admin: &PgPool) -> Uuid {
    sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(admin)
        .await
        .unwrap()
}

#[tokio::test]
async fn fija_color_logo_restaura_y_rechaza_svg_malicioso() {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org = org_id(&admin).await;

    // Estado inicial: deja la marca en limpio.
    sqlx::query(r#"UPDATE "Organization" SET "brandColor" = NULL, "logoUrl" = NULL WHERE id = $1"#)
        .bind(org)
        .execute(&admin)
        .await
        .unwrap();
    let b0 = service::get(&app, org).await.unwrap();
    assert_eq!(b0.brand_color, None);

    // Fija color y logo PNG (no toca el logo si se omite, etc. — aquí ambos).
    let set = service::update(
        &app,
        org,
        UpdateBranding {
            brand_color: Some(Some("#1A2B3C".into())),
            logo_url: Some(Some("data:image/png;base64,AAAA".into())),
        },
    )
    .await
    .unwrap();
    assert_eq!(set.brand_color.as_deref(), Some("#1A2B3C"));
    assert_eq!(set.logo_url.as_deref(), Some("data:image/png;base64,AAAA"));

    // PATCH parcial: cambia solo el color, el logo se conserva (ausente = no tocar).
    let only_color = service::update(
        &app,
        org,
        UpdateBranding {
            brand_color: Some(Some("#FFFFFF".into())),
            logo_url: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(only_color.brand_color.as_deref(), Some("#FFFFFF"));
    assert_eq!(
        only_color.logo_url.as_deref(),
        Some("data:image/png;base64,AAAA")
    );

    // Color con formato inválido → BadRequest.
    assert_eq!(
        service::update(
            &app,
            org,
            UpdateBranding {
                brand_color: Some(Some("rojo".into())),
                logo_url: None,
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // SVG con <script> → BadRequest (base64 de "<svg><script/></svg>").
    let bad_svg = "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=";
    assert_eq!(
        service::update(
            &app,
            org,
            UpdateBranding {
                brand_color: None,
                logo_url: Some(Some(bad_svg.into())),
            },
        )
        .await
        .err(),
        Some(AppError::BadRequest)
    );

    // Restaura a null (valor por defecto del sistema).
    let restored = service::update(
        &app,
        org,
        UpdateBranding {
            brand_color: Some(None),
            logo_url: Some(None),
        },
    )
    .await
    .unwrap();
    assert_eq!(restored.brand_color, None);
    assert_eq!(restored.logo_url, None);
}
