//! Verificación de contraseñas con **bcrypt** (doc 06).
//!
//! Compatibilidad: los usuarios existentes tienen hashes bcrypt de cost 10
//! (creados por `bcryptjs` en NestJS). El port DEBE verificarlos tal cual; por
//! eso se usa bcrypt (no Argon2 todavía — migración futura).
//!
//! - CPU-bound ⇒ se verifica dentro de `spawn_blocking` para no bloquear el
//!   runtime async (doc 06).
//! - SEC-14 (timing): cuando el usuario no existe o está inactivo se pasa
//!   `hash = None` y se verifica igualmente contra un hash dummy, para que el
//!   tiempo de respuesta no revele si un email existe.

use std::sync::OnceLock;

/// Cost de los hashes existentes (NestJS `SALT_ROUNDS = 10`). El dummy usa el
/// mismo cost para igualar el tiempo de verificación.
const BCRYPT_COST: u32 = 10;

/// Hash bcrypt (cost 10) de un valor que NO es una credencial. Se calcula una
/// sola vez. Verificar contra él siempre da `false`, pero consume el mismo
/// tiempo que una verificación real (SEC-14).
fn dummy_hash() -> &'static str {
    static H: OnceLock<String> = OnceLock::new();
    H.get_or_init(|| {
        bcrypt::hash("timing-equalizer-not-a-credential", BCRYPT_COST).expect("hash dummy")
    })
}

/// Verifica `password` contra el hash del usuario, o contra el dummy si `hash`
/// es `None` (usuario inexistente/inactivo). Devuelve `true` solo si coincide.
pub async fn verify_password(password: String, hash: Option<String>) -> bool {
    let target = hash.unwrap_or_else(|| dummy_hash().to_owned());
    tokio::task::spawn_blocking(move || bcrypt::verify(&password, &target).unwrap_or(false))
        .await
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn verifies_correct_and_rejects_wrong() {
        // Cost bajo en test (solo para velocidad); la lógica es la misma.
        let hash = bcrypt::hash("s3cret", 4).unwrap();
        assert!(verify_password("s3cret".into(), Some(hash.clone())).await);
        assert!(!verify_password("nope".into(), Some(hash)).await);
    }

    #[tokio::test]
    async fn none_hash_runs_dummy_and_is_false() {
        assert!(!verify_password("whatever".into(), None).await);
    }
}
