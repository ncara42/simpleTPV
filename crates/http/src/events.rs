//! Eventos en tiempo real vía SSE (`GET /events`, #32) — port de `events`
//! (interface + in-memory-event-bus + controller). Bus **in-process** por tenant
//! (`tokio::broadcast`): es la elección para despliegue de instancia única; un
//! bus Redis solo haría falta con múltiples réplicas.
//!
//! Publishers cableados (en la capa http, al volver del servicio = after-commit):
//! `sale.completed` (handler de `POST /sales`) y `cash.movement.requested`
//! (handler de `POST /cash-sessions/:id/movements/request`).
//! Pendientes: `stock.changed` y `alert.created` se emiten POR MOVIMIENTO dentro
//! de `stock::apply_movement`/`reevaluate_alert` (profundo; lo invocan ventas/
//! devoluciones/traspasos/compras/ajustes); cablearlos exige propagar un publisher
//! a través de la primitiva de stock (deuda acotada, varios ficheros).
//!
//! Filtrado por tenant SIEMPRE en el servidor (org del JWT); el cliente nunca
//! elige el tenant. Tope de conexiones por usuario (SEC-03) liberado al cerrar.

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::extractor::AuthUser;
use crate::state::AppState;

/// Capacidad del canal por tenant: si un suscriptor se retrasa más de esto,
/// pierde eventos antiguos (Lagged) pero la conexión sobrevive.
const CHANNEL_CAPACITY: usize = 64;
/// Máximo de conexiones SSE concurrentes por usuario en esta réplica (SEC-03).
const MAX_SSE_PER_USER: usize = 5;
const HEARTBEAT_SECS: u64 = 15;

/// Evento de la app (`type` + payload libre). El cliente filtra por `type`.
#[derive(Clone, Debug)]
pub struct AppEvent {
    pub event_type: String,
    pub data: serde_json::Value,
}

/// Bus de eventos in-process + contador de conexiones por usuario. Clonable
/// barato (Arc por dentro); una sola instancia vive en `AppState`.
#[derive(Clone)]
pub struct EventHub {
    inner: Arc<Inner>,
}

struct Inner {
    senders: Mutex<HashMap<Uuid, broadcast::Sender<AppEvent>>>,
    connections: Mutex<HashMap<Uuid, usize>>,
}

impl EventHub {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                senders: Mutex::new(HashMap::new()),
                connections: Mutex::new(HashMap::new()),
            }),
        }
    }

    fn sender(&self, org: Uuid) -> broadcast::Sender<AppEvent> {
        self.inner
            .senders
            .lock()
            .expect("event senders lock")
            .entry(org)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    /// Suscribe al canal del tenant (lo crea si no existía).
    pub fn subscribe(&self, org: Uuid) -> broadcast::Receiver<AppEvent> {
        self.sender(org).subscribe()
    }

    /// Difunde un evento a los suscriptores del tenant (no hace nada si no hay).
    pub fn publish(&self, org: Uuid, event: AppEvent) {
        if let Some(sender) = self
            .inner
            .senders
            .lock()
            .expect("event senders lock")
            .get(&org)
        {
            let _ = sender.send(event); // Err solo si no hay receptores
        }
    }

    /// Reserva un hueco de conexión para `user` si no supera el tope. El guard lo
    /// libera al caer (cierre de la conexión SSE).
    fn try_acquire(&self, user: Uuid) -> Option<ConnGuard> {
        let mut conns = self.inner.connections.lock().expect("connections lock");
        let n = conns.entry(user).or_insert(0);
        if *n >= MAX_SSE_PER_USER {
            return None;
        }
        *n += 1;
        Some(ConnGuard {
            hub: self.clone(),
            user,
        })
    }
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new()
    }
}

/// Libera el hueco de conexión del usuario al cerrarse la conexión SSE.
struct ConnGuard {
    hub: EventHub,
    user: Uuid,
}

impl Drop for ConnGuard {
    fn drop(&mut self) {
        let mut conns = self.hub.inner.connections.lock().expect("connections lock");
        if let Some(n) = conns.get_mut(&self.user) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                conns.remove(&self.user);
            }
        }
    }
}

/// `GET /events` — stream SSE multiplexado, filtrado por el tenant del JWT.
/// Cualquier rol autenticado. 429 si el usuario supera el tope de conexiones.
pub async fn stream(State(state): State<AppState>, user: AuthUser) -> Response {
    let Some(guard) = state.events().try_acquire(user.user_id) else {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "Demasiadas conexiones SSE abiertas; cierra alguna e inténtalo de nuevo",
        )
            .into_response();
    };
    let mut rx = state.events().subscribe(user.organization_id);

    let body = async_stream::stream! {
        // El guard se mueve al stream: se libera el hueco cuando este termina.
        let _guard = guard;
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    let data = serde_json::to_string(&ev.data).unwrap_or_else(|_| "{}".to_owned());
                    yield Ok::<Event, Infallible>(Event::default().event(ev.event_type).data(data));
                }
                // El suscriptor se retrasó y perdió eventos: sigue con los nuevos.
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                // Canal cerrado (no debería con el sender vivo en el hub): fin.
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    let mut response = Sse::new(body)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(HEARTBEAT_SECS))
                .text("ping"),
        )
        .into_response();
    apply_sse_no_buffer(response.headers_mut());
    response
}

/// Cabeceras para que proxies/CDN (Cloudflare, Nginx) NO buffericen ni transformen
/// el stream SSE. Sin esto, el CDN retiene los eventos y el cliente no los recibe en
/// vivo (solo al recargar, leyendo de BD). `no-transform` desactiva la compresión de
/// Cloudflare (la causa del buffering); `X-Accel-Buffering: no` lo honra Nginx.
pub(crate) fn apply_sse_no_buffer(headers: &mut HeaderMap) {
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-transform"),
    );
    headers.insert("x-accel-buffering", HeaderValue::from_static("no"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn publish_llega_a_los_suscriptores_del_mismo_tenant() {
        let hub = EventHub::new();
        let org = Uuid::new_v4();
        let other = Uuid::new_v4();
        let mut rx = hub.subscribe(org);
        let mut rx_other = hub.subscribe(other);

        hub.publish(
            org,
            AppEvent {
                event_type: "stock.changed".into(),
                data: serde_json::json!({ "productId": "x" }),
            },
        );

        let ev = rx.try_recv().expect("evento recibido");
        assert_eq!(ev.event_type, "stock.changed");
        // El otro tenant NO recibe el evento.
        assert!(rx_other.try_recv().is_err());
    }

    #[test]
    fn el_tope_de_conexiones_se_respeta_y_se_libera() {
        let hub = EventHub::new();
        let user = Uuid::new_v4();
        let guards: Vec<_> = (0..MAX_SSE_PER_USER)
            .map(|_| hub.try_acquire(user).expect("hueco disponible"))
            .collect();
        // Superar el tope → None.
        assert!(hub.try_acquire(user).is_none());
        // Liberar uno → vuelve a haber hueco.
        drop(guards.into_iter().next().unwrap());
        assert!(hub.try_acquire(user).is_some());
    }
}
