//! Integración de la gestión de usuarios (#153) contra Postgres con RLS: alta
//! (sin exponer hash), listado con tiendas, edición, PIN, asignación de tiendas
//! (rechaza tiendas ajenas), borrado e import CSV. Usa emails con prefijo único
//! por test para no chocar con el seed ni con tests en paralelo.

use std::time::Duration;

use simpletpv_domain::users::model::UserRole;
use simpletpv_domain::users::{service, CreateUser, UpdateUser};
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

struct Ctx {
    admin: PgPool,
    app: PgPool,
    org: Uuid,
    tag: String,
}

async fn setup() -> Ctx {
    let admin = pool("DATABASE_URL_ADMIN", DEV_ADMIN_URL).await;
    let app = pool("DATABASE_URL_APP", DEV_APP_URL).await;
    let org: Uuid = sqlx::query_scalar(r#"SELECT id FROM "Organization" WHERE nif = 'B11111111'"#)
        .fetch_one(&admin)
        .await
        .unwrap();
    Ctx {
        admin,
        app,
        org,
        tag: Uuid::new_v4().simple().to_string(),
    }
}

async fn teardown(c: &Ctx) {
    // Borra solo los usuarios creados por este test (email con el tag único).
    let pat = format!("%{}@u.test", c.tag);
    sqlx::query(
        r#"DELETE FROM "UserStore" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)"#,
    )
    .bind(&pat)
    .execute(&c.admin)
    .await
    .unwrap();
    sqlx::query(r#"DELETE FROM "User" WHERE email LIKE $1"#)
        .bind(&pat)
        .execute(&c.admin)
        .await
        .unwrap();
    sqlx::query(r#"DELETE FROM "Store" WHERE name = $1"#)
        .bind(format!("Tienda-{}", c.tag))
        .execute(&c.admin)
        .await
        .unwrap();
}

fn new_user(tag: &str, who: &str, role: &str) -> CreateUser {
    CreateUser {
        email: format!("{who}.{tag}@u.test"),
        name: format!("Usuario {who}"),
        password: "password123".into(),
        role: role.into(),
    }
}

#[tokio::test]
async fn alta_listado_y_tiendas() {
    let c = setup().await;
    // Alta.
    let created = service::create(&c.app, c.org, new_user(&c.tag, "ana", "CLERK"))
        .await
        .unwrap();
    assert_eq!(created.role, UserRole::Clerk);
    assert!(created.active);

    // Aparece en el listado, con storeIds vacío.
    let list = service::find_all(&c.app, c.org).await.unwrap();
    let mine = list
        .iter()
        .find(|u| u.id == created.id)
        .expect("usuario listado");
    assert!(mine.store_ids.is_empty());

    // Crea una tienda y asígnala.
    let store = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO "Store" (id, "organizationId", name, code) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(store)
    .bind(c.org)
    .bind(format!("Tienda-{}", c.tag))
    .bind(format!("U{}", &store.simple().to_string()[..8]))
    .execute(&c.admin)
    .await
    .unwrap();
    service::assign_stores(&c.app, c.org, created.id, vec![store])
        .await
        .unwrap();
    let list = service::find_all(&c.app, c.org).await.unwrap();
    let mine = list.iter().find(|u| u.id == created.id).unwrap();
    assert_eq!(mine.store_ids, vec![store]);

    // Una tienda inexistente/ajena → BadRequest.
    assert_eq!(
        service::assign_stores(&c.app, c.org, created.id, vec![Uuid::new_v4()])
            .await
            .err(),
        Some(AppError::BadRequest)
    );

    teardown(&c).await;
}

#[tokio::test]
async fn edicion_pin_y_borrado() {
    let c = setup().await;
    let created = service::create(&c.app, c.org, new_user(&c.tag, "leo", "MANAGER"))
        .await
        .unwrap();

    // Edita el nombre y el rol.
    let updated = service::update(
        &c.app,
        c.org,
        created.id,
        UpdateUser {
            name: Some("Leo Editado".into()),
            email: None,
            role: Some("ADMIN".into()),
            active: Some(false),
            password: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.name, "Leo Editado");
    assert_eq!(updated.role, UserRole::Admin);
    assert!(!updated.active);

    // Fija PIN (válido).
    service::set_pin(&c.app, c.org, created.id, "4321".into())
        .await
        .unwrap();

    // Borra → un update posterior es 404.
    service::remove(&c.app, c.org, created.id).await.unwrap();
    assert_eq!(
        service::update(
            &c.app,
            c.org,
            created.id,
            UpdateUser {
                name: Some("x".into()),
                email: None,
                role: None,
                active: None,
                password: None,
            }
        )
        .await
        .err(),
        Some(AppError::NotFound)
    );

    teardown(&c).await;
}

#[tokio::test]
async fn import_csv_valida_por_fila() {
    let c = setup().await;
    let csv = format!(
        "email,name,password,role\n\
         buena1.{tag}@u.test,Buena Uno,password123,CLERK\n\
         emailmalo,Mala,password123,CLERK\n\
         buena2.{tag}@u.test,Buena Dos,password123,MANAGER\n",
        tag = c.tag
    );
    let res = service::import_csv(&c.app, c.org, &csv).await.unwrap();
    assert_eq!(res.inserted, 2, "dos filas válidas insertadas");
    assert_eq!(res.errors.len(), 1, "una fila inválida reportada");
    assert_eq!(res.errors[0].row, 3, "la fila 3 (email malo)");

    teardown(&c).await;
}

#[tokio::test]
async fn rechaza_entrada_invalida() {
    let c = setup().await;
    // Email inválido.
    assert!(service::create(
        &c.app,
        c.org,
        CreateUser {
            email: "no-email".into(),
            name: "X".into(),
            password: "password123".into(),
            role: "CLERK".into(),
        }
    )
    .await
    .is_err());
    // Contraseña corta.
    assert!(
        service::create(&c.app, c.org, new_user_pwd(&c.tag, "corta", "1234"))
            .await
            .is_err()
    );
    // Rol inválido.
    assert!(service::create(
        &c.app,
        c.org,
        CreateUser {
            email: format!("rol.{}@u.test", c.tag),
            name: "X".into(),
            password: "password123".into(),
            role: "SUPERUSER".into(),
        }
    )
    .await
    .is_err());
    teardown(&c).await;
}

fn new_user_pwd(tag: &str, who: &str, pwd: &str) -> CreateUser {
    CreateUser {
        email: format!("{who}.{tag}@u.test"),
        name: format!("Usuario {who}"),
        password: pwd.into(),
        role: "CLERK".into(),
    }
}
