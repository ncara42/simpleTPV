//! Firma y verificación de JWT con **HS256** (doc 06).
//!
//! Seguridad: la whitelist de algoritmos es exactamente `[HS256]`
//! (`Validation::new(HS256)`), lo que mitiga la confusión de algoritmos y
//! `alg:none`. `leeway = 0` (sin tolerancia), `exp` siempre validado. Cualquier
//! fallo de verificación se mapea a `AppError::Unauthorized` (neutro).

use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{de::DeserializeOwned, Serialize};
use simpletpv_shared::AppError;

const ALG: Algorithm = Algorithm::HS256;

struct KeyPair {
    enc: EncodingKey,
    dec: DecodingKey,
}

/// Firmador/verificador de tokens. Mantiene claves separadas para access y
/// refresh (secretos distintos) y una `Validation` estricta compartida.
pub struct Jwt {
    access: KeyPair,
    refresh: KeyPair,
    validation: Validation,
}

impl Jwt {
    pub fn new(access_secret: &[u8], refresh_secret: &[u8]) -> Self {
        let mut validation = Validation::new(ALG); // whitelist = [HS256]
        validation.leeway = 0; // sin tolerancia en exp (doc 06)
        validation.validate_exp = true;
        validation.validate_aud = false; // los tokens no llevan `aud` (paridad NestJS)
        Self {
            access: KeyPair {
                enc: EncodingKey::from_secret(access_secret),
                dec: DecodingKey::from_secret(access_secret),
            },
            refresh: KeyPair {
                enc: EncodingKey::from_secret(refresh_secret),
                dec: DecodingKey::from_secret(refresh_secret),
            },
            validation,
        }
    }

    pub fn sign_access<T: Serialize>(&self, claims: &T) -> Result<String, AppError> {
        Self::sign(&self.access, claims)
    }

    pub fn sign_refresh<T: Serialize>(&self, claims: &T) -> Result<String, AppError> {
        Self::sign(&self.refresh, claims)
    }

    pub fn verify_access<T: DeserializeOwned>(&self, token: &str) -> Result<T, AppError> {
        self.verify(&self.access, token)
    }

    pub fn verify_refresh<T: DeserializeOwned>(&self, token: &str) -> Result<T, AppError> {
        self.verify(&self.refresh, token)
    }

    fn sign<T: Serialize>(key: &KeyPair, claims: &T) -> Result<String, AppError> {
        encode(&Header::new(ALG), claims, &key.enc).map_err(|e| {
            // Fallo de firma = problema interno, nunca culpa del cliente.
            tracing::error!(error = %e, "firma de JWT falló");
            AppError::Internal
        })
    }

    fn verify<T: DeserializeOwned>(&self, key: &KeyPair, token: &str) -> Result<T, AppError> {
        decode::<T>(token, &key.dec, &self.validation)
            .map(|data| data.claims)
            .map_err(|_| AppError::Unauthorized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct C {
        sub: String,
        iat: usize,
        exp: usize,
    }

    fn now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    fn jwt() -> Jwt {
        Jwt::new(b"access-secret", b"refresh-secret")
    }

    fn claims(exp_offset: i64) -> C {
        let t = now();
        C {
            sub: "u1".into(),
            iat: t as usize,
            exp: (t + exp_offset) as usize,
        }
    }

    #[test]
    fn roundtrip_access() {
        let j = jwt();
        let token = j.sign_access(&claims(60)).unwrap();
        let back: C = j.verify_access(&token).unwrap();
        assert_eq!(back.sub, "u1");
    }

    #[test]
    fn rejects_expired() {
        let j = jwt();
        let token = j.sign_access(&claims(-60)).unwrap();
        assert_eq!(
            j.verify_access::<C>(&token).unwrap_err(),
            AppError::Unauthorized
        );
    }

    #[test]
    fn rejects_tampered() {
        let j = jwt();
        let token = format!("{}x", j.sign_access(&claims(60)).unwrap());
        assert!(j.verify_access::<C>(&token).is_err());
    }

    #[test]
    fn rejects_token_signed_with_other_key() {
        let j = jwt();
        // Firmado con la clave de refresh, verificado con la de access ⇒ falla.
        let token = j.sign_refresh(&claims(60)).unwrap();
        assert!(j.verify_access::<C>(&token).is_err());
    }
}
