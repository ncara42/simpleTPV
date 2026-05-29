# Spec — Issue #72: Endurecimiento de seguridad (RBAC + rate limit + helmet + CORS)

| Campo  | Valor                          |
| ------ | ------------------------------ |
| Fecha  | 2026-05-29                     |
| Estado | En desarrollo                  |
| Issue  | #72 — `area:api`, `mvp:week-5` |

## 1. Objetivo

Endurecer la API para producción (Semana 5 / HITO A): rate limiting, cabeceras de
seguridad (helmet), CORS explícito por allowlist, y dejar documentada la matriz de
permisos RBAC verificada al 100%.

## 2. RBAC — matriz verificada

Auditoría completa en `docs/superpowers/specs/2026-05-29-issue72-hardening-design.md`
(sección 6, abajo). **Resultado:** el modelo ya era correcto — `AuthGuard` global
exige JWT salvo `@Public` (`/auth/login`, `/auth/refresh`, `/health`); `RolesGuard`
global aplica `@Roles`. Los GET sin `@Roles` (productos, familias, `/me/stores`) son
lecturas necesarias del TPV, aisladas por RLS. Mutaciones sensibles (anular venta,
ajustar stock, usuarios, tiendas, pedidos) restringidas a ADMIN/MANAGER. Devolución
sin ticket exige PIN de MANAGER/ADMIN en el service. **Sin cambios de código en RBAC.**

## 3. Rate limiting (@nestjs/throttler v6)

- `ThrottlerModule.forRoot` con un límite global por defecto: **120 req / 60 s por IP**
  (holgado para el uso del TPV: ventas, búsquedas rápidas; corta abuso/fuerza bruta).
- `ThrottlerGuard` como `APP_GUARD` (se añade DESPUÉS de Auth/Roles en el array, pero
  el orden de throttling es independiente; cuenta por IP+ruta).
- **Login endurecido**: `POST /auth/login` con `@Throttle({ default: { limit: 5, ttl: 60000 } })`
  — 5 intentos/min para frenar fuerza bruta de credenciales.
- Tests no deben dispararlo: el `ThrottlerModule` se configura con un límite alto y
  los specs de integración hacen pocas requests; el e2e también. Si fuese necesario,
  se puede subir el límite vía env `THROTTLE_LIMIT`.

## 4. Helmet + CORS (main.ts)

- `app.use(helmet())` antes de los pipes: cabeceras seguras por defecto
  (`X-Content-Type-Options`, `Strict-Transport-Security`, etc.). Se desactiva
  `contentSecurityPolicy` por defecto (la API sirve JSON + Swagger; una CSP estricta
  rompería la UI de Swagger). Documentado.
- CORS por allowlist desde env `CORS_ORIGINS` (CSV). En dev, por defecto permite los
  orígenes de los frontends (`http://localhost:5173`, `:5174`, `:4173`, `:4174`).
  `credentials: true`, métodos y cabeceras estándar (incluida `Authorization`).

## 5. Configuración por entorno

| Env              | Default (dev)                 | Producción (Dokploy)               |
| ---------------- | ----------------------------- | ---------------------------------- |
| `CORS_ORIGINS`   | localhost 5173/5174/4173/4174 | dominios reales del backoffice/TPV |
| `THROTTLE_TTL`   | 60000 (ms)                    | igual o ajustado                   |
| `THROTTLE_LIMIT` | 120                           | ajustar según carga real           |

## 6. Tests

- **Unit**: `auth.controller` ya cubierto; añadir un test de que `main.ts`/bootstrap
  helpers (factory de CORS allowlist) parsean bien `CORS_ORIGINS`.
- **Integración**: un spec que verifica que el `ThrottlerGuard` está activo
  (ráfaga > límite de login → 429) sería frágil y lento; en su lugar se prueba el
  helper puro de configuración. El comportamiento real se valida manualmente.

## 7. Fuera de alcance

- WAF / protección DDoS a nivel de infraestructura (capa de Dokploy/Nginx).
- Rotación de secretos JWT (gestión de secretos en Dokploy).
