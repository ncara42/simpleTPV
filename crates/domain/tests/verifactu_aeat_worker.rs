//! Integración del worker de transporte VERI\*FACTU a la AEAT (#156, Fase 4):
//! `process_aeat_batch` contra Postgres efímero, con un **doble de transporte**
//! (`AeatTransport`) que devuelve respuestas canónicas SIN tocar la red. Verifica las
//! transiciones de estado del registro y la traza `VerifactuSubmission`:
//!  - aceptado → SENT + CSV + traza; idempotente.
//!  - rechazado (datos) → FAILED + errorCode (requiere subsanación).
//!  - duplicado → SENT (idempotencia de la AEAT).
//!  - sin línea / fallo de red / HTTP no-2xx → reintento (PENDING, backoff).
//!  - sin certificado / certificado inválido → se difiere SIN gastar intentos (fail-safe).
//!  - varios registros de un comercio → un único sobre (batching ≤1000).
//!  - ciclo de subsanación: rechazo → FAILED → `retry` (marca subsanación) → reenvío
//!    con `Subsanacion=S` → SENT.
//!
//! Cada test usa una org desechable (BYPASSRLS) y acota el batch con `Some(org)` para
//! aislarse de otros tests en paralelo.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use simpletpv_domain::verifactu::aeat::{
    process_aeat_batch, AeatEndpoint, AeatTransport, AeatWorkerConfig, SistemaInformatico,
    TransportError, TransportResult,
};
use simpletpv_domain::verifactu::queue;
use sqlx::postgres::{PgPool, PgPoolOptions};
use uuid::Uuid;

const DEV_ADMIN_URL: &str = "postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv";

async fn admin_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL_ADMIN").unwrap_or_else(|_| DEV_ADMIN_URL.to_owned());
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .expect("conectar a Postgres")
}

async fn temp_org(admin: &PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(r#"INSERT INTO "Organization" (id, name) VALUES ($1, $2)"#)
        .bind(id)
        .bind(format!("vf-aeat-test-{id}"))
        .execute(admin)
        .await
        .expect("crear org de test");
    id
}

/// Configura el comercio en modalidad de envío. `mode`: `COLLAB_SOCIAL` o `DIRECT_OWN_CERT`.
async fn seed_config(admin: &PgPool, org: Uuid, mode: &str) {
    sqlx::query(
        r#"INSERT INTO "VerifactuConfig" ("organizationId", mode, "razonSocial", environment, exento)
           VALUES ($1, $2, 'Comercio Verde SL', 'preprod', false)"#,
    )
    .bind(org)
    .bind(mode)
    .execute(admin)
    .await
    .expect("crear VerifactuConfig");
}

/// Inserta una venta (`INVOICE`) PENDING con un payload de alta realista y su serie.
async fn insert_invoice(admin: &PgPool, org: Uuid, serie: &str) -> Uuid {
    let id = Uuid::new_v4();
    let hash = format!("{:0>64}", id.simple());
    let payload = serde_json::json!({
        "idEmisorFactura": "B12345678",
        "numSerieFactura": serie,
        "fechaExpedicionFactura": "02-06-2026",
        "tipoFactura": "F2",
        "cuotaTotal": "9.35",
        "importeTotal": "53.90",
        "fechaHoraHusoGenRegistro": "2026-06-02T14:05:00+02:00",
        "huella": hash,
        "desglose": [{
            "impuesto": "01",
            "tipoImpositivo": "21.00",
            "baseImponibleOimporteNoSujeto": "44.55",
            "cuotaRepercutida": "9.35"
        }]
    })
    .to_string();
    sqlx::query(
        r#"INSERT INTO "VerifactuRecord"
             (id, "organizationId", type, status, hash, payload)
           VALUES ($1, $2, 'INVOICE'::"VerifactuType", 'PENDING'::"VerifactuStatus", $3, $4::jsonb)"#,
    )
    .bind(id)
    .bind(org)
    .bind(&hash)
    .bind(&payload)
    .execute(admin)
    .await
    .expect("insertar INVOICE PENDING");
    id
}

#[derive(sqlx::FromRow)]
struct Rec {
    status: String,
    attempts: i32,
    csv: Option<String>,
    aeat_state: Option<String>,
    error_code: Option<String>,
    last_error: Option<String>,
    subsanacion: bool,
    next_future: bool,
}

async fn rec(admin: &PgPool, id: Uuid) -> Rec {
    sqlx::query_as(
        r#"SELECT status::text AS status, attempts, csv, "aeatState" AS aeat_state,
                  "errorCode" AS error_code, "lastError" AS last_error, subsanacion,
                  COALESCE("nextAttemptAt" > now(), false) AS next_future
           FROM "VerifactuRecord" WHERE id = $1"#,
    )
    .bind(id)
    .fetch_one(admin)
    .await
    .expect("leer VerifactuRecord")
}

async fn submissions(admin: &PgPool, id: Uuid) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "VerifactuSubmission" WHERE "recordId" = $1"#)
        .bind(id)
        .fetch_one(admin)
        .await
        .unwrap()
}

async fn cleanup(admin: &PgPool, org: Uuid) {
    // Orden por FKs: submission (RESTRICT a org) → record → config/cert → org.
    for sql in [
        r#"DELETE FROM "VerifactuSubmission" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "VerifactuRecord" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "VerifactuConfig" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "VerifactuCertificate" WHERE "organizationId" = $1"#,
        r#"DELETE FROM "Organization" WHERE id = $1"#,
    ] {
        sqlx::query(sql).bind(org).execute(admin).await.unwrap();
    }
}

// --- Doble de transporte (sin red) -----------------------------------------------

enum FakeMode {
    /// Respuesta HTTP 2xx con este cuerpo XML de la AEAT.
    Body(String),
    /// La AEAT devolvió un HTTP no-2xx (SOAP Fault).
    Status(u16),
    /// Fallo de red/TLS.
    Network,
    /// Identidad/certificado inválido (`AeatClient::new` fallaría).
    Build,
}

struct FakeTransport {
    mode: FakeMode,
    /// Sobres SOAP enviados (para inspeccionar el XML generado).
    seen: Arc<Mutex<Vec<String>>>,
}

impl FakeTransport {
    fn new(mode: FakeMode) -> Self {
        Self {
            mode,
            seen: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl AeatTransport for FakeTransport {
    async fn submit(
        &self,
        _identity_pem: &[u8],
        _endpoint: AeatEndpoint,
        _timeout_secs: u64,
        soap_xml: &str,
    ) -> Result<TransportResult, TransportError> {
        // El guard no cruza ningún await (la futura sigue siendo Send).
        self.seen.lock().unwrap().push(soap_xml.to_owned());
        match &self.mode {
            FakeMode::Body(b) => Ok(TransportResult {
                http_status: 200,
                body: b.clone(),
            }),
            FakeMode::Status(c) => Err(TransportError::Status {
                code: *c,
                body: "<fault/>".to_owned(),
            }),
            FakeMode::Network => Err(TransportError::Network("conexión rechazada".to_owned())),
            FakeMode::Build => Err(TransportError::Build("identidad PEM inválida".to_owned())),
        }
    }
}

fn cfg(collab_cert: bool) -> AeatWorkerConfig {
    AeatWorkerConfig {
        sistema: SistemaInformatico {
            nombre_razon: "Software Casa SL".into(),
            nif: "B99999999".into(),
            nombre_sistema: "simpleTPV".into(),
            id_sistema: "01".into(),
            version: "0.1.0".into(),
            numero_instalacion: "001".into(),
            solo_verifactu: true,
            multi_ot: true,
            indicador_multi_ot: true,
        },
        collab_cert_pem: collab_cert.then(|| b"dummy-pem".to_vec()),
        cert_key: None,
        timeout_secs: 5,
    }
}

/// Respuesta de la AEAT con N líneas aceptadas (una por serie), cada una con su CSV.
fn body_ok(series_csv: &[(&str, &str)]) -> String {
    let lineas: String = series_csv
        .iter()
        .map(|(s, csv)| {
            format!(
                "<RespuestaLinea><NumSerieFactura>{s}</NumSerieFactura>\
                 <EstadoRegistro>Correcto</EstadoRegistro><CSV>{csv}</CSV></RespuestaLinea>"
            )
        })
        .collect();
    format!(
        r#"<RespuestaRegFactuSistemaFacturacion xmlns="urn:r">
             <EstadoEnvio>Correcto</EstadoEnvio><TiempoEsperaEnvio>60</TiempoEsperaEnvio>{lineas}
           </RespuestaRegFactuSistemaFacturacion>"#
    )
}

/// Respuesta con una línea rechazada (error de datos).
fn body_rechazo(serie: &str, code: &str, desc: &str) -> String {
    format!(
        r#"<RespuestaRegFactuSistemaFacturacion xmlns="urn:r">
             <EstadoEnvio>Incorrecto</EstadoEnvio>
             <RespuestaLinea><NumSerieFactura>{serie}</NumSerieFactura>
               <EstadoRegistro>Incorrecto</EstadoRegistro>
               <CodigoErrorRegistro>{code}</CodigoErrorRegistro>
               <DescripcionErrorRegistro>{desc}</DescripcionErrorRegistro>
             </RespuestaLinea>
           </RespuestaRegFactuSistemaFacturacion>"#
    )
}

/// Respuesta con una línea marcada Incorrecto pero con `RegistroDuplicado` (idempotente).
fn body_duplicado(serie: &str) -> String {
    format!(
        r#"<RespuestaRegFactuSistemaFacturacion xmlns="urn:r">
             <EstadoEnvio>ParcialmenteCorrecto</EstadoEnvio>
             <RespuestaLinea><NumSerieFactura>{serie}</NumSerieFactura>
               <EstadoRegistro>Incorrecto</EstadoRegistro>
               <RegistroDuplicado><EstadoRegistroDuplicado>Correcto</EstadoRegistroDuplicado></RegistroDuplicado>
             </RespuestaLinea>
           </RespuestaRegFactuSistemaFacturacion>"#
    )
}

// --- Tests -----------------------------------------------------------------------

#[tokio::test]
async fn aceptado_marca_sent_con_csv_y_traza() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100001").await;

    let fake = FakeTransport::new(FakeMode::Body(body_ok(&[("T01-100001", "CSV-OK-1")])));
    let n = process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n, 1, "procesa el único PENDING de la org");

    let r = rec(&admin, id).await;
    assert_eq!(r.status, "SENT", "aceptado → SENT");
    assert_eq!(r.attempts, 1);
    assert_eq!(
        r.csv.as_deref(),
        Some("CSV-OK-1"),
        "guarda el CSV justificante"
    );
    assert_eq!(r.aeat_state.as_deref(), Some("Correcto"));
    assert_eq!(submissions(&admin, id).await, 1, "una fila de traza");

    // El sobre enviado contiene el RegistroAlta con la serie.
    let enviados = fake.seen.lock().unwrap().clone();
    assert_eq!(enviados.len(), 1);
    assert!(enviados[0].contains("<sf:RegistroAlta>"));
    assert!(enviados[0].contains("<sf:NumSerieFactura>T01-100001</sf:NumSerieFactura>"));

    // Idempotencia: nada PENDING que reenviar.
    let n2 = process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n2, 0, "lo ya SENT no se reprocesa");

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn rechazo_de_datos_marca_failed_con_codigo() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100002").await;

    let fake = FakeTransport::new(FakeMode::Body(body_rechazo(
        "T01-100002",
        "1102",
        "NIF no identificado",
    )));
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(
        r.status, "FAILED",
        "rechazo de datos → FAILED (requiere subsanación)"
    );
    assert_eq!(r.error_code.as_deref(), Some("1102"));
    assert_eq!(r.aeat_state.as_deref(), Some("Incorrecto"));
    assert!(r.last_error.as_deref().unwrap_or("").contains("NIF"));
    assert_eq!(submissions(&admin, id).await, 1);

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn duplicado_marca_sent() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100003").await;

    let fake = FakeTransport::new(FakeMode::Body(body_duplicado("T01-100003")));
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(
        r.status, "SENT",
        "registro ya en la AEAT (duplicado) → SENT idempotente"
    );
    assert_eq!(submissions(&admin, id).await, 1);

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn sin_linea_para_el_registro_reintenta() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100004").await;

    // La AEAT responde OK pero sin línea para nuestra serie → ambiguo → reintentar.
    let fake = FakeTransport::new(FakeMode::Body(body_ok(&[("OTRA-SERIE", "CSV-X")])));
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(r.status, "PENDING", "sin desenlace claro → sigue PENDING");
    assert_eq!(r.attempts, 1);
    assert!(
        r.next_future,
        "se programa reintento (nextAttemptAt futuro)"
    );
    assert!(r.csv.is_none());

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn fallo_de_red_reintenta() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100005").await;

    let fake = FakeTransport::new(FakeMode::Network);
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(r.status, "PENDING", "fallo de transporte → reintento");
    assert_eq!(r.attempts, 1);
    assert!(r.next_future);
    assert!(r.last_error.as_deref().unwrap_or("").contains("conexión"));
    assert_eq!(
        submissions(&admin, id).await,
        1,
        "queda traza del intento fallido"
    );

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn http_no_2xx_reintenta() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100006").await;

    let fake = FakeTransport::new(FakeMode::Status(500));
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(r.status, "PENDING", "HTTP no-2xx → reintento");
    assert_eq!(r.attempts, 1);
    assert!(r.next_future);

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn sin_certificado_se_difiere_sin_gastar_intentos() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    // DIRECT_OWN_CERT pero sin clave de descifrado ni certificado en BD → sin identidad.
    seed_config(&admin, org, "DIRECT_OWN_CERT").await;
    let id = insert_invoice(&admin, org, "T01-100007").await;

    let fake = FakeTransport::new(FakeMode::Body(body_ok(&[("T01-100007", "X")])));
    process_aeat_batch(&admin, &cfg(false), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(
        r.status, "PENDING",
        "sin certificado → no se envía (fail-safe)"
    );
    assert_eq!(
        r.attempts, 0,
        "no se gasta intento por una mala configuración"
    );
    assert!(r.next_future, "se reintentará con backoff");
    assert!(r
        .last_error
        .as_deref()
        .unwrap_or("")
        .contains("sin certificado"));
    assert_eq!(
        submissions(&admin, id).await,
        0,
        "no hay envío → no hay traza"
    );
    assert!(
        fake.seen.lock().unwrap().is_empty(),
        "el transporte no se invoca"
    );

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn certificado_invalido_se_difiere() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-100008").await;

    let fake = FakeTransport::new(FakeMode::Build);
    process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();

    let r = rec(&admin, id).await;
    assert_eq!(
        r.status, "PENDING",
        "certificado inválido → defer, no fallo de la AEAT"
    );
    assert_eq!(r.attempts, 0);
    assert!(r.next_future);
    assert!(r
        .last_error
        .as_deref()
        .unwrap_or("")
        .contains("certificado inválido"));
    assert_eq!(submissions(&admin, id).await, 0);

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn varios_registros_de_un_comercio_van_en_un_solo_sobre() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id1 = insert_invoice(&admin, org, "T01-200001").await;
    let id2 = insert_invoice(&admin, org, "T01-200002").await;

    let fake = FakeTransport::new(FakeMode::Body(body_ok(&[
        ("T01-200001", "CSV-A"),
        ("T01-200002", "CSV-B"),
    ])));
    let n = process_aeat_batch(&admin, &cfg(true), &fake, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(n, 2);

    assert_eq!(rec(&admin, id1).await.status, "SENT");
    assert_eq!(rec(&admin, id2).await.status, "SENT");

    // Un único envío con los DOS RegistroFactura (batching por tenant).
    let enviados = fake.seen.lock().unwrap().clone();
    assert_eq!(enviados.len(), 1, "un solo sobre para todo el comercio");
    assert_eq!(
        enviados[0].matches("<sfLR:RegistroFactura>").count(),
        2,
        "los dos registros viajan en el mismo sobre"
    );

    cleanup(&admin, org).await;
}

#[tokio::test]
async fn ciclo_subsanacion_rechazo_retry_reenvia_con_subsanacion() {
    let admin = admin_pool().await;
    let org = temp_org(&admin).await;
    seed_config(&admin, org, "COLLAB_SOCIAL").await;
    let id = insert_invoice(&admin, org, "T01-300001").await;

    // 1) La AEAT rechaza por datos → FAILED.
    let rechazo = FakeTransport::new(FakeMode::Body(body_rechazo(
        "T01-300001",
        "1110",
        "Desglose incorrecto",
    )));
    process_aeat_batch(&admin, &cfg(true), &rechazo, 50, Some(org))
        .await
        .unwrap();
    assert_eq!(rec(&admin, id).await.status, "FAILED");

    // 2) El comercio corrige y reintenta: `retry` reabre el registro y, al venir de un
    //    rechazo de la AEAT, lo marca como subsanación.
    queue::retry(&admin, org, id).await.unwrap();
    let r = rec(&admin, id).await;
    assert_eq!(r.status, "PENDING", "retry reabre el registro");
    assert_eq!(r.attempts, 0, "retry resetea intentos");
    assert!(r.subsanacion, "un reenvío tras rechazo es una subsanación");

    // 3) El reenvío incluye Subsanacion=S y la AEAT lo acepta → SENT.
    let acepta = FakeTransport::new(FakeMode::Body(body_ok(&[("T01-300001", "CSV-SUB")])));
    process_aeat_batch(&admin, &cfg(true), &acepta, 50, Some(org))
        .await
        .unwrap();

    let enviados = acepta.seen.lock().unwrap().clone();
    assert_eq!(enviados.len(), 1);
    assert!(
        enviados[0].contains("<sf:Subsanacion>S</sf:Subsanacion>"),
        "el reenvío de subsanación lleva Subsanacion=S"
    );
    assert_eq!(
        rec(&admin, id).await.status,
        "SENT",
        "subsanación aceptada → SENT"
    );

    cleanup(&admin, org).await;
}
