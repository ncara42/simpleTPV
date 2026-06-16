# Migración backend a Rust — 06. Referencia Auth y Seguridad

> Documentación **oficial** vía Context7. Código verbatim; nada inventado.
> Crates: `jsonwebtoken`, `argon2` (RustCrypto), `validator`, `secrecy`.
> Replica: JWT con `organizationId` como claim, roles, hashing de contraseñas/PIN, mitigación de ataques.

---

## 1. JWT — `jsonwebtoken` (`/keats/jsonwebtoken`)

Claims = cualquier tipo `Serialize + Deserialize`; claims custom = campos extra.

```rust
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,             // user ID
    exp: usize,              // requerido por defecto
    iat: usize,
    iss: String,
    aud: String,
    organization_id: String, // claim multi-tenant
    role: String,            // claim de rol
}
```

Firmar:

```rust
use jsonwebtoken::{encode, Header, EncodingKey, Algorithm};
// HS256 (simétrico)
let t = encode(&Header::default(), &claims, &EncodingKey::from_secret("secret".as_ref()))?;
// RS256 (asimétrico, recomendado prod)
let t = encode(&Header::new(Algorithm::RS256), &claims, &EncodingKey::from_rsa_pem(include_bytes!("privkey.pem"))?)?;
```

Verificar — `Validation.algorithms` es **whitelist** (mitiga algorithm-confusion / `alg:none`):

> _"The `algorithms` list acts as a whitelist; if it's empty, decoding always fails."_

```rust
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
let mut v = Validation::new(Algorithm::RS256);   // solo RS256 pasa
v.validate_exp = true;
v.set_issuer(&["exact-issuer"]);
v.set_audience(&["exact-app-id"]);
v.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
v.leeway = 0;                                     // sin tolerancia en prod
let data = decode::<Claims>(&token, &key, &v)?;
```

> **Nunca** incluir `Algorithm::None` en `v.algorithms`. `leeway` por defecto = 60s; bajar en prod.

`DecodingKey`: `from_secret(b"...")` (HS*), `from_rsa_pem(...)` (RS*), `from_ed_der(...)` (EdDSA).

**Decisión:** RS256 o EdDSA (asimétrico — la clave de firma no sale del backend). Mantener la lista de algoritmos a exactamente uno.

---

## 2. Hashing de contraseñas — `argon2` (`/websites/rs_argon2_argon2`)

```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

// Hash (registro / set password)
let salt = SaltString::generate(&mut OsRng);          // salt único por contraseña
let hash = Argon2::default().hash_password(pw, &salt)?.to_string(); // PHC string → BD

// Verify (login)
let parsed = PasswordHash::new(&stored_hash)?;
let ok = Argon2::default().verify_password(pw, &parsed).is_ok();
```

> Nota doc: _"hash params from `parsed_hash` are used instead of what is configured in the `Argon2` instance."_ ⇒ se puede subir el coste sin romper hashes antiguos.
> Formato PHC: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` (auto-descriptivo).
> **Coste de CPU ⇒ ejecutar dentro de `tokio::task::spawn_blocking`** (ver doc Tokio).

`bcrypt`: Context7 no devolvió doc oficial del crate. El backend actual usa bcrypt (`bcryptjs`); para Rust, **Argon2id es la recomendación moderna**. Decisión: migrar a Argon2id o mantener bcrypt para compatibilidad con hashes existentes (a decidir; afecta a la tabla `User.passwordHash`/`pinHash`).

---

## 3. Validación de DTOs — `validator` (`/websites/rs_validator_0_20_0_validator`)

```rust
use serde::Deserialize;
use validator::{Validate, ValidationError};

#[derive(Debug, Validate, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignupData {
    #[validate(email)]                              mail: String,
    #[validate(length(min = 1), custom(function = "validate_unique"))] first_name: String,
    #[validate(range(min = 18, max = 120))]         age: u32,
    #[validate(nested)]                             address: Address,
}
```

Atributos: `email`, `url`, `length(min,max)`, `range(min,max)`, `custom(function="...")`, `nested`.
**Integración Axum:** no hay extractor oficial en el propio crate; patrón manual o crate `axum-valid`:

```rust
async fn signup(Json(p): Json<SignupData>) -> impl IntoResponse {
    if let Err(e) = p.validate() { return (StatusCode::UNPROCESSABLE_ENTITY, Json(e)).into_response(); }
    // ...
}
```

> Sustituye `class-validator` + `ValidationPipe`. Combinar con `#[serde(deny_unknown_fields)]` para replicar `forbidNonWhitelisted`.

---

## 4. Secretos en memoria — `secrecy` (`/websites/rs_secrecy_secrecy`)

```rust
use secrecy::{SecretBox, ExposeSecret};
struct AuthConfig { jwt_secret: SecretBox<String> }
let key = EncodingKey::from_secret(cfg.jwt_secret.expose_secret().as_bytes());
// SecretBox hace zeroize de la memoria al drop (compiler-intrinsics)
```

> _"Wrapper type for values that contains secrets... ensure secrets are wiped from memory when dropped."_ Acceso explícito vía `expose_secret()` → fácil de auditar en review.

---

## 5. Tabla de decisiones de seguridad

| Aspecto         | Decisión                                      | Justificación (doc)                            |
| --------------- | --------------------------------------------- | ---------------------------------------------- |
| Algoritmo JWT   | RS256 / EdDSA                                 | Asimétrico; clave de firma no sale del backend |
| `alg` whitelist | `vec![Algorithm::RS256]` exacto               | Lista vacía falla; `alg:none` nunca            |
| Claim tenant    | `organization_id: String`                     | Serde transparente                             |
| `exp`           | Validado siempre                              | Requerido por defecto                          |
| Leeway          | `0` en prod                                   | Sin tolerancia innecesaria                     |
| Hash contraseña | Argon2id + salt `OsRng`                       | Salt único, PHC auto-descriptivo               |
| Verificación    | Params del hash guardado                      | Subir coste sin romper hashes                  |
| Hash en async   | `spawn_blocking`                              | CPU-bound, no bloquear runtime                 |
| Secretos        | `SecretBox`                                   | Zeroize + acceso explícito                     |
| Validación      | `#[derive(Validate)]` + `deny_unknown_fields` | Reemplaza class-validator + whitelist          |

> Pendiente de portar (sin crate específico aquí, lógica de dominio): refresh token rotation con detección de reuso → revocar familia (carreras: `UPDATE ... WHERE used_at IS NULL` atómico), rate limiting (`tower_governor` o `Semaphore`, a investigar), mitigación timing-attack en login (comparar contra hash dummy si el usuario no existe), audit log.

---

## Fuentes (Context7)

- jsonwebtoken: `/keats/jsonwebtoken`
- argon2 (RustCrypto): `/websites/rs_argon2_argon2`
- validator: `/websites/rs_validator_0_20_0_validator`
- secrecy: `/websites/rs_secrecy_secrecy`
