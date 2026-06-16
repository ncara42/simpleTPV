# Migración backend a Rust — 05. Referencia Tokio (runtime async)

> Documentación **oficial** vía Context7 (`/tokio-rs/tokio`). Código verbatim donde se indica.
> ⚠️ **Aviso de procedencia:** algunas APIs (`task_local!`, `tokio::signal`, `tokio::time::interval`,
> superficie de `Semaphore`, distinción `Mutex`) **no aparecieron indexadas en Context7** en estas
> consultas; el agente las complementó con el API público estable de Tokio 1.x (docs.rs).
> **Marcadas abajo con 🔶 — verificar contra docs.rs antes de escribir código de producción.**

---

## 1. Runtime

```rust
// Conveniencia (= Builder multi_thread + enable_all)
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> { /* ... */ }

// Manual (control de worker threads)
let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)        // default = núcleos del sistema; override TOKIO_WORKER_THREADS
    .enable_all()
    .build()?;
rt.block_on(async { /* ... */ });
```

Default de `worker_threads`: _"The default value is the number of cores available to the system."_

---

## 2. Tasks

- `tokio::spawn(async { ... })` → `JoinHandle<T>`. Si se descarta el handle, la task **sigue corriendo**. Para cancelar al drop: `tokio_util::task::AbortOnDropHandle`.
- `tokio::task::spawn_blocking(|| { ... })` → para trabajo **bloqueante/CPU-bound** (hashing argon2/bcrypt, fs sync). Pool separado, **512 threads** por defecto.

Regla oficial:

> _"Use `spawn_blocking` for short-lived blocking operations / Use dedicated threads for long-lived or persistent blocking workloads."_

```rust
// Hashing de contraseña (bloqueante) fuera del worker thread:
let hash = tokio::task::spawn_blocking(move || bcrypt::hash(password, bcrypt::DEFAULT_COST))
    .await.expect("spawn_blocking panicked")?;
```

---

## 3. Concurrencia y cancelación

- `tokio::select!` — espera varias futures; la primera que resuelve gana. **Cuidado con cancel-safety** de cada método antes de usarlo en `select!`.
- 🔶 **`tokio::signal`** (graceful shutdown SIGTERM/Ctrl-C) — patrón canónico, ya cubierto en doc de Axum (`with_graceful_shutdown`). Verificar.
- 🔶 **`CancellationToken`** (`tokio-util`, feature `rt`) — propagación de cancelación en árboles de tasks:
  ```rust
  let token = CancellationToken::new();
  let child = token.child_token();
  tokio::spawn(async move { tokio::select! { _ = child.cancelled() => {}, r = work() => {} } });
  token.cancel();
  ```

---

## 4. Sincronización

**Regla clave (de la doc):**

- `std::sync::Mutex` → el guard **NO** cruza un `.await` (más rápido).
- `tokio::sync::Mutex` → el guard **vive a través de un `.await`** (evita deadlock del scheduler).

Otros: `RwLock`, `mpsc` (bounded, `channel(buffer)` con backpressure; `try_send` no-bloqueante), `oneshot`, `broadcast` (1→N, receptor rezagado recibe `Lagged`), 🔶 `Semaphore` (rate limiting / límite de concurrencia):

```rust
let sem = Arc::new(Semaphore::new(10));            // máx 10 simultáneas
let _permit = sem.acquire().await.unwrap();        // se libera al drop
```

---

## 5. Timeouts e intervalos

```rust
use tokio::time::timeout;
if timeout(Duration::from_millis(10), fut).await.is_err() { /* timeout */ }
```

Nota doc: el timeout se comprueba **antes** de pollear; una future que no cede puede completar excediendo el timeout sin error.
🔶 `tokio::time::interval(Duration)` para tareas periódicas — para servicios web preferir `MissedTickBehavior::Skip`/`Delay` (no `Burst`). Verificar.

---

## 6. 🔶 Task-local storage (`tokio::task_local!`) — equivalente a AsyncLocalStorage

**Pieza clave para portar el tenant context.** ⚠️ No surfaceó en Context7; verificar en docs.rs/tokio antes de implementar.

```rust
tokio::task_local! { pub static CURRENT_ORG: String; }

// Establecer para un scope (envuelve toda la cadena de handlers):
CURRENT_ORG.scope(org_id, async move { route_request(req).await }).await;

// Leer:
let id = CURRENT_ORG.with(|v| v.clone());
```

**Diferencia crítica con Node `AsyncLocalStorage`:**

|                         | Node `AsyncLocalStorage` | `tokio::task_local!`                                  |
| ----------------------- | ------------------------ | ----------------------------------------------------- |
| Herencia a tasks hijas  | Automática               | **NO** — cada `spawn` es contexto nuevo               |
| Propagación a sub-tasks | No necesaria             | **Manual**: capturar el valor (`move`) y re-`scope()` |
| Acceso fuera de scope   | Permitido                | **Panic / None**                                      |

⇒ En Rust: cada `tokio::spawn` que necesite tenant debe **re-establecer** `CURRENT_ORG.scope(...)` con el valor capturado. Alternativa más robusta: pasar el `organization_id` **explícitamente** por parámetro a la capa de datos (sin task-local), lo que elimina toda esta clase de bug. **Recomendación: evaluar pasar el tenant explícito vs task-local en el diseño** (ver doc de síntesis, riesgo RLS).

---

## 7. Pitfalls

- **Nunca bloquear el runtime:** usar `tokio::time::sleep`, `tokio::fs`, o `spawn_blocking`; no `std::thread::sleep` ni I/O síncrono en handlers.
- **No anidar runtimes** (panic _"Cannot start a runtime from within a runtime"_); usar `block_in_place` + `Handle::current().block_on` si hay que integrar código síncrono.
- **Budget cooperativo** (128 unidades/task): en loops largos usar `tokio::task::yield_now().await` o `consume_budget().await`.

---

## Fuentes (Context7)

`/tokio-rs/tokio`: `runtime/builder.rs`, `task/blocking.rs`, `macros/select.rs`, `io/util/async_buf_read_ext.rs`, `sync/mpsc/bounded.rs`, `sync/broadcast.rs`, `time/timeout.rs`, `tokio-util/src/task/abort_on_drop.rs`, `runtime/context/runtime.rs`, `task/coop/{consume_budget,mod}.rs`.
🔶 Complementado con API público estable de Tokio 1.x (docs.rs) para `task_local!`, `signal`, `interval`, `Semaphore`, distinción `Mutex` — **pendiente de verificación directa en docs.rs**.
