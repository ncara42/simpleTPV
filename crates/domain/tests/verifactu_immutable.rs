//! Inmutabilidad de los campos fiscales de `VerifactuRecord` (#156, deuda D2 de la
//! auditoría). El trigger `verifactu_record_inmutable_trg` impide MODIFICAR en BD los
//! campos de la cadena (hash, previousHash, payload, type, organizationId, saleId,
//! returnId, qrData) aunque el rol tenga `GRANT ALL`, mientras deja pasar los updates
//! legítimos de estado/transporte que hacen la cola y el worker.
//!
//! Requiere la migración `20260629140000_verifactu_immutable` aplicada (el binario la
//! aplica al arrancar; en CI la aplica `prisma migrate deploy`).

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

async fn admin_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL_ADMIN").unwrap_or_else(|_| DEV_ADMIN_URL.to_owned());
    PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

async fn temp_org(admin: &PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(r#"INSERT INTO "Organization" (id, name) VALUES ($1, $2)"#)
        .bind(id)
        .bind(format!("vf-immutable-test-{id}"))
        .execute(admin)
        .await
        .expect("crear org de test");
    id
}

/// Inserta un INVOICE PENDING mínimo y devuelve su id.
async fn insert_record(admin: &PgPool, org: Uuid) -> Uuid {
    let id = Uuid::new_v4();
    let hash = format!("{:0>64}", id.simple());
    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", type, status, hash, payload)
           VALUES ($1, $2, 'INVOICE'::"VerifactuType", 'PENDING'::"VerifactuStatus", $3,
             '{"total":"10.00"}'::jsonb)"#,
    )
    .bind(id)
    .bind(org)
    .bind(&hash)
    .execute(admin)
    .await
    .expect("insertar INVOICE PENDING");
    id
}

async fn cleanup(admin: &PgPool, org: Uuid) {
    let _ = sqlx::query(r#"DELETE FROM "VerifactuRecord" WHERE "organizationId" = $1"#)
        .bind(org)
        .execute(admin)
        .await;
    let _ = sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#)
        .bind(org)
        .execute(admin)
        .await;
}

#[tokio::test]
async fn los_campos_de_estado_y_transporte_son_mutables() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    let id = insert_record(&admin, org).await;

    // Lo que hace el worker al enviar: status, csv, aeatState, attempts, sentAt...
    let res = sqlx::query(
        r#"UPDATE "VerifactuRecord"
             SET status = 'SENT'::"VerifactuStatus", csv = 'CSV-123',
                 "aeatState" = 'Correcto', attempts = 1, "sentAt" = now(),
                 subsanacion = true, "rechazoPrevio" = true
           WHERE id = $1"#,
    )
    .bind(id)
    .execute(&admin)
    .await;

    assert!(
        res.is_ok(),
        "los updates de estado/transporte deben pasar el trigger: {res:?}"
    );

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn la_huella_es_inmutable() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    let id = insert_record(&admin, org).await;

    let err = sqlx::query(r#"UPDATE "VerifactuRecord" SET hash = $2 WHERE id = $1"#)
        .bind(id)
        .bind(format!("{:0>64}", 0)) // huella distinta
        .execute(&admin)
        .await
        .expect_err("modificar la huella debe ser rechazado por el trigger");

    assert!(
        err.to_string().contains("inmutable"),
        "el error debe venir del trigger de inmutabilidad: {err}"
    );

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn el_payload_y_el_encadenamiento_son_inmutables() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    let id = insert_record(&admin, org).await;

    // payload (el documento fiscal que entra en la huella)
    let err_payload =
        sqlx::query(r#"UPDATE "VerifactuRecord" SET payload = $2::jsonb WHERE id = $1"#)
            .bind(id)
            .bind(r#"{"total":"9999.00"}"#)
            .execute(&admin)
            .await
            .expect_err("modificar el payload debe ser rechazado");
    assert!(err_payload.to_string().contains("inmutable"));

    // previousHash (el eslabón de la cadena)
    let err_prev = sqlx::query(r#"UPDATE "VerifactuRecord" SET "previousHash" = $2 WHERE id = $1"#)
        .bind(id)
        .bind(format!("{:0>64}", 7))
        .execute(&admin)
        .await
        .expect_err("modificar previousHash debe ser rechazado");
    assert!(err_prev.to_string().contains("inmutable"));

    cleanup(&admin, org).await;
}
