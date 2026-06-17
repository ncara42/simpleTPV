# Fase 6 — Corte a producción (#156)

> Estrategia, Dockerfile, variables de entorno y guardas del corte del backend
> NestJS → Rust. El corte EN VIVO es una operación manual y autorizada: este
> documento prepara los artefactos, **no** los ejecuta. Recordatorio operativo:
> un push a `main` despliega en Dokploy al instante **aunque el CI falle** — el
> corte no se decide por merge accidental.

## Estado de partida

Rust cubre las Fases 0–5 (≈122/160 rutas; la diferencia son verbos/subrutas y
`tpv-dashboard`, aún en NestJS). **No hay paridad de rutas al 100%**, así que un
big-bang (apagar NestJS y encender Rust de golpe) todavía no es posible sin
perder endpoints. → El corte es **progresivo (strangler)**.

## Decisión: strangler progresivo (no big-bang)

Un **proxy inverso** delante de ambos backends enruta por prefijo de ruta: las
rutas ya migradas van al servicio Rust; el resto, a NestJS. Se migra por tandas,
observando, hasta que Rust alcanza paridad total; entonces se enruta el 100% a
Rust y se retira NestJS (ese último paso sí es un big-bang del remanente).

```
            ┌──────────────┐   /auth/*, /products/*, /sales/*, …  ┌──────────┐
  cliente → │ proxy inverso│ ───────────────────────────────────→ │  Rust    │ :3001
            │ (Dokploy/    │   (rutas migradas)                    └──────────┘
            │  Traefik/    │
            │  Caddy)      │   /tpv-dashboard/*, resto             ┌──────────┐
            └──────────────┘ ───────────────────────────────────→ │  NestJS  │ :3001
                                                                   └──────────┘
```

Por qué strangler y no big-bang:

- Cobertura parcial: cortar de golpe dejaría rutas sin servir.
- Reversible por ruta: si una ruta migrada falla en prod, se reapunta a NestJS
  sin redeploy del binario.
- Riesgo acotado: se empieza por rutas de lectura / bajo riesgo.

### Invariante crítico durante la convivencia

Ambos backends comparten **la misma base de datos** y **los mismos secretos**,
para que un token y una cookie valgan en los dos:

- **Secretos JWT idénticos** en ambos (`JWT_SECRET`, `JWT_REFRESH_SECRET`): el
  access token (HS256, interop ya garantizada) se valida igual en Rust y NestJS.
- **Cookie de refresh**: `path=/`, mismos atributos (`COOKIE_SECURE`, SameSite),
  mismo dominio. La rotación SEC-06 usa la misma tabla `RefreshToken` → la
  familia de refresh es coherente aunque `/auth/refresh` lo sirva un backend u
  otro. **Recomendación**: enrutar todo `/auth/*` a UN solo backend para no
  partir la rotación entre dos durante una misma sesión.
- **SEC-01 (autorización por tienda)**: ambos backends aplican la misma RLS por
  tenant + las mismas comprobaciones `has_store_access` (portadas en Fase 3/4).
  Verificar que el proxy NO añade cabeceras de confianza que un backend interprete
  y el otro no (el `organizationId` viaja DENTRO del JWT; no hay `X-Org-Id`).
- **CORS**: `CORS_ORIGINS` con los mismos orígenes en ambos.
- **Migraciones**: las sigue aplicando **Prisma Migrate** (NestJS / job de
  migración). El contenedor Rust NO migra (SQLx solo consume). Aplicar la
  migración ANTES de enrutar tráfico a la versión que la necesita.

### Secuencia sugerida de corte

1. Desplegar el servicio Rust en paralelo (sin tráfico), healthcheck `/ready` ok.
2. Enrutar a Rust un primer lote de bajo riesgo (p.ej. `/health`, `/ready`,
   catálogo de lectura), observar logs/Sentry.
3. Ampliar por dominios ya migrados (auth, products, stock, sales, returns,
   dashboard de central, b2b, api-keys…).
4. Completar la paridad pendiente (tpv-dashboard y subrutas) — ver auditoría de
   paridad de tests.
5. Enrutar el 100% a Rust; retirar NestJS del proxy; desmontar el servicio NestJS.

## Dockerfile

`crates/Dockerfile` (multistage): builder `rust:1.96-slim-bookworm` que compila
`--release --locked --bin simpletpv-api` (el perfil release ya trae
`lto=thin`/`codegen-units=1`/`strip`), runtime `debian:bookworm-slim` con
`ca-certificates` (TLS rustls hacia Postgres/Redis/Sentry) + `curl` para el
`HEALTHCHECK` contra `/health`. Corre como usuario sin privilegios. Build:

```bash
docker build -f crates/Dockerfile -t simpletpv-api-rust crates/
```

## Variables de entorno / secretos de producción (Dokploy)

El binario hace **fail-fast**: sin las obligatorias, no arranca.

| Variable                                           | Oblig.        | Descripción                                                                         |
| -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL_APP`                                 | **Sí**        | Rol `app` (RLS aplicada). Conexión de dominio.                                      |
| `DATABASE_URL_AUTH`                                | **Sí**        | Rol `app_admin` (BYPASSRLS): login pre-tenant, lookup de API key, worker VeriFactu. |
| `JWT_SECRET`                                       | **Sí**        | Secreto de firma del access token (HS256). **Idéntico al de NestJS.**               |
| `JWT_REFRESH_SECRET`                               | **Sí**        | Secreto del refresh. **Idéntico al de NestJS.**                                     |
| `CORS_ORIGINS`                                     | **Sí (prod)** | CSV de orígenes http(s) permitidos.                                                 |
| `BIND_ADDR`                                        | No            | Default `127.0.0.1:3001`; en contenedor `0.0.0.0:3001` (lo fija el Dockerfile).     |
| `COOKIE_SECURE`                                    | No            | `true` en prod (cookie de refresh solo HTTPS).                                      |
| `JWT_ACCESS_TTL_SECS` / `JWT_REFRESH_TTL_SECS`     | No            | Defaults 900 / 604800.                                                              |
| `REDIS_URL`                                        | No            | Caché de stock (#28). Ausente → degrada a Postgres.                                 |
| `SENTRY_DSN`                                       | No            | Observabilidad. Ausente → Sentry deshabilitado (no-op).                             |
| `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | No            | Entorno y muestreo (def 0.0).                                                       |

> **Gotcha (incidente 502 de prod):** `DATABASE_URL_AUTH` con placeholders sin
> sustituir tumba el arranque. El rol es `app_admin` (BYPASSRLS); su password en
> prod se aplica con `ALTER ROLE app_admin LOGIN PASSWORD '<secreto>'` (no vive
> en migraciones). Verificar que ambas URLs apuntan a roles reales con login.

## Pendiente antes del flip definitivo

### Bloqueante de FEATURE — RESUELTO

- **Audit log — PORTADO** (`crates/http/src/audit.rs`). Middleware Axum global
  (capa más interna del stack) que, tras CADA mutación exitosa (POST/PUT/PATCH/
  DELETE con respuesta 2xx de un usuario autenticado), inserta en `AuditLog`
  (`action`/`entity`/`entityId`/`userId`/`organizationId`) bajo `with_tenant_tx`
  (RLS). Best-effort, no silencioso (SEC-22). Paridad con el `AuditInterceptor`
  de NestJS. Test: `crates/http/tests/audit_http.rs`.

### Paridad de rutas

- Portar `tpv-dashboard` y subrutas que falten (ver índice del EPIC #158).

### Deuda de tests de integración (de la auditoría de paridad, ~85% cubierto)

Los endpoints existen; falta cobertura de aserción:

- **dashboard**: 2 de ~13 KPIs tienen test numérico explícito; añadir
  sales-by-family, sales-by-hour, product/archetype-rotation, margin-kpis,
  stockout-kpis, product-rankings.
- **verifactu**: test explícito del encadenamiento (`r2.previousHash == hash(r1)`).
- **b2b**: transición a SHIPPED + rechazo de tarifa cross-tenant.
- **app-bootstrap (http)**: `/health` público (200) y `/products` sin token (401).

## Revisión de seguridad final

Revisión adversarial del backend Rust completo (Fase 5 incl.): **0 CRITICAL, 3
HIGH, 5 MEDIUM, 3 LOW**. Web/authz sólido: RLS en un único punto, SEC-01, JWT
HS256 con whitelist y leeway 0, rotación SEC-06, timing SEC-14, secretos en
`SecretString` + `send_default_pii=false`, errores neutros, **cero inyección SQL**
(los `format!` solo expanden constantes de columna), **cero `unsafe`**,
rate-limits y cabeceras de seguridad, aislamiento de tenant en la caché Redis.

Corregido en esta tanda:

- **H-01** — el worker de envío VeriFactu (SandboxProvider, marca SENT sin
  declarar a la AEAT) ahora **solo arranca con `VERIFACTU_SANDBOX_SEND=true`**;
  en prod queda apagado y los registros se quedan PENDING (no SENT falso).
- **H-03** — la URL de cotejo AEAT ya no está cableada a preproducción:
  configurable con `AEAT_COTEJO_URL`, **default producción** (`www2.aeat.es`).
- **H-02** — `retry` de VeriFactu resetea `attempts=0` (antes un FAILED re-encolado
  fallaba tras un único intento).
- **M-02** advisory lock a `hashtextextended` (64 bits) · **M-05** `attempts` se
  incrementa en SQL · **M-01** test de Redis sin password hardcodeada · **L-01**
  ejemplos OpenAPI sin credenciales reales.

Pendiente (no bloqueante para preparar; sí antes/durante el corte):

- **H-01 (operativo)**: para declarar de verdad hace falta **proveedor AEAT
  certificado**; hasta entonces, VeriFactu en modo piloto (sandbox) debe
  acordarse formalmente, o el envío queda apagado.
- **M-04** backoff exponencial del worker: **diferido**. Los reintentos YA están
  acotados (≤5 intentos y luego FAILED — no hay flood infinito); un backoff real
  necesita una columna `lastAttemptAt` (migración Prisma) y solo importa con el
  proveedor AEAT real → se hará junto a él.

Ya corregidos: **M-03** (`Permissions-Policy` + `preload` en HSTS) y **L-02**
(allowlist de `status` en `/verifactu/records` + cota de `within_days` a 3650).

- **Lockout de PIN en Redis** (S-09): solo si se escala a varias réplicas del
  servicio Rust (con una sola, el in-memory es correcto).
