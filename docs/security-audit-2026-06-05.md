# Auditoría de seguridad — simpleTPV (2026-06-05)

- **Fecha:** 2026-06-05
- **Alcance:** todo el repositorio en su estado actual — `apps/api` (NestJS/Prisma/RLS), `apps/tpv` y `apps/backoffice` (React/Vite), `packages/*`, infraestructura (`Dockerfile`s, `docker-compose.yml`, `.github/workflows`). Sin diff pendiente: se audita el código tal cual, como paso previo a la siguiente iteración de features.
- **Metodología:** auditoría multi-agente en 4 dominios en paralelo (auth/multi-tenant · inyección SQL · validación/ficheros/cripto · config/secretos/frontends), cada hallazgo con verificación adversarial de 3 lentes (alcanzabilidad · explotabilidad/impacto · corrección técnica) y puntuación de confianza 1–10. Solo se reportan hallazgos con **confianza ≥ 7**. Cruzado contra la auditoría previa `docs/security-audit-2026-06-03.md`.

> **Continuidad.** Esta auditoría confirma que la mayoría de hallazgos del 2026-06-03 están **remediados** (incluido el HIGH crítico SEC-01 IDOR cross-store, además de SEC-06/08/14/17/18/19/20/21). El hallazgo principal vigente es una **regresión del modo demo** de los frontends.

---

## Resumen ejecutivo

El núcleo de seguridad del backend es **sólido**: aislamiento multi-tenant por RLS con `FORCE` y fail-safe a 0 filas, `organizationId` siempre desde el JWT (nunca del input), `set_config` parametrizado, **todo el SQL crudo parametrizado** (cero `queryRawUnsafe`), refresh tokens con rotación/`jti`/revocación + cookie httpOnly, secretos JWT obligatorios sin default, sin credenciales de producción hardcodeadas, sin sinks de XSS y sin fuga de `passwordHash`/`pinHash`.

El riesgo vigente se concentra en el **modo DEMO de los frontends** (integridad de release, no fuga de datos: el backend rechaza el JWT falso `alg:none`) y en una **validación numérica incompleta** de los DTOs transaccionales.

| Severidad | Nº (confianza ≥7) |
| --------- | ----------------- |
| HIGH      | 0                 |
| MEDIUM    | 3                 |
| LOW       | 3                 |

---

## Tabla de hallazgos

| ID   | Sev.   | Conf. | CWE          | Título                                                                                   | Estado vs 03-jun                   | Ubicación                                                                                                                                                           |
| ---- | ------ | ----- | ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | MEDIUM | 8     | CWE-489/1188 | TPV: imagen de producción horneada en MODO DEMO (login acepta cualquier credencial)      | **Regresión** (SEC-04 empeorado)   | `apps/tpv/Dockerfile:37`, `apps/tpv/src/lib/api-config.ts:7`, `apps/tpv/src/lib/auth.ts:15`                                                                         |
| A-02 | MEDIUM | 8     | CWE-489/603  | Backoffice: sin modo real — login siempre entra como ADMIN, incondicional                | **Vivo** (SEC-05)                  | `apps/backoffice/src/lib/auth.ts:12-21`                                                                                                                             |
| A-03 | MEDIUM | 8     | CWE-20/1339  | Cantidades/importes transaccionales sin `@Max` ni `maxDecimalPlaces`                     | **Vivo parcial** (SEC-15 residual) | `sales.dto.ts:22,34,54,67`; `purchases.dto.ts:18,22,51`; `transfers.dto.ts:19,48`; `returns.dto.ts:19,46`; `stock.dto.ts:24,37,51`; `cash-sessions.dto.ts:11,18,27` |
| A-04 | LOW    | 7     | CWE-613      | AuthGuard no revalida `active`/`role` por petición (ventana ≤15 min)                     | **Vivo** (SEC-13)                  | `apps/api/src/auth/auth.guard.ts:55-63`                                                                                                                             |
| A-05 | LOW    | 7     | CWE-538      | `.dockerignore` no excluye `.env*`: ficheros de entorno entran al build de los frontends | **Nuevo**                          | `.dockerignore`, `apps/{tpv,backoffice}/Dockerfile` (`COPY . .`)                                                                                                    |
| A-06 | LOW    | 7     | CWE-1021     | CSP de helmet desactivada en la API (y sin CSP en el nginx de los frontends)             | **Nuevo**                          | `apps/api/src/main.ts:41`                                                                                                                                           |

---

## Detalle de hallazgos

### A-01 · [MEDIUM, conf. 8] TPV horneado en modo DEMO por defecto

- **Ubicación:** `apps/tpv/Dockerfile:37` (`ARG VITE_DEMO_MODE=true`), `apps/tpv/src/lib/api-config.ts:8` (`isDemo() = VITE_DEMO_MODE !== 'false'`), `apps/tpv/src/lib/auth.ts:15-21`.
- **Descripción (verificado a mano):** el default es DEMO y el Dockerfile lo fija **explícitamente a `true`** ("la imagen de producción se hornea en MODO DEMO… REVERTIR antes de lanzar"). En demo, `login()` ignora email/password y guarda un `DEMO_JWT` (`alg:none`, `role:CLERK`) sin contactar la API. Vite congela el valor en el bundle en build.
- **Exploit:** cualquier despliegue del repo sin pasar `VITE_DEMO_MODE=false` sirve públicamente un TPV donde cualquiera entra escribiendo cualquier cosa.
- **Impacto matizado:** el `AuthGuard` real rechaza el `alg:none` con 401 y las libs devuelven datos demo → **sin fuga de datos reales ni acceso cross-tenant**. Daño = integridad de release.
- **Fix:** invertir a opt-in (`isDemo() = VITE_DEMO_MODE === 'true'`) para que producción **nunca** caiga en demo por omisión; quitar el `ARG …=true` del Dockerfile; smoke test de deploy que falle si el login acepta credenciales inválidas.

### A-02 · [MEDIUM, conf. 8] Backoffice sin modo real: login siempre ADMIN

- **Ubicación:** `apps/backoffice/src/lib/auth.ts:12-21`, `App.tsx` (guard que solo comprueba `accessToken !== null` y `getRole()==='ADMIN'` decodificando el claim **sin verificar firma**).
- **Descripción (verificado a mano):** a diferencia del TPV, el backoffice **no tiene toggle** (`isDemo` no existe). El override de `login()` es **incondicional**: siempre guarda un `DEMO_JWT` `{role:ADMIN, alg:none}`. Todas las libs de lectura devuelven `Promise.resolve(DEMO_*)`.
- **Exploit:** cualquiera con la URL del backoffice entra como ADMIN al panel completo con datos demo.
- **Impacto matizado:** las 2 únicas llamadas reales (`POST /stock/adjust`, `POST /products/import`) salen con el JWT falso → el backend las rechaza con 401. Sin brecha cross-tenant. Riesgo = panel de administración con bypass total de login.
- **Fix:** cablear autenticación real (`POST /auth/login`) antes de exponerlo; mientras siga demo, no servirlo en URL pública (basic-auth / IP allowlist en nginx). **Es prerequisito de la fase de cableado demo→API del plan de iteración.**

### A-03 · [MEDIUM, conf. 8] Importes/cantidades transaccionales sin cota ni escala decimal

- **Ubicación:** `sales.dto.ts:22` (`qty` solo `@IsPositive`), `:34` (`discountAmt`), `:54` (`cashGiven`), `:67` (`ticketDiscountAmt`); equivalentes en `purchases.dto.ts`, `transfers.dto.ts`, `returns.dto.ts`, `stock.dto.ts`, `cash-sessions.dto.ts`.
- **Descripción:** `products.dto.ts` se blindó con `@Max(999999.9999)` + `@IsNumber({maxDecimalPlaces})` (fix de SEC-15), pero las cantidades e importes de ventas/compras/traspasos/devoluciones/inventario/caja **no**. La `ValidationPipe` global (`whitelist`+`transform`) no impone cota superior ni decimales.
- **Exploit:** un CLERK envía una venta con `qty=9e15` o `1.23456789` → (a) valor fuera de la precisión `Decimal` ⇒ Postgres rechaza el INSERT ⇒ **500 en vez de 400**; (b) decimales fuera de escala ⇒ Postgres **redondea** ⇒ la cantidad almacenada puede divergir de la usada en el cálculo de totales ⇒ discrepancias contables/de stock sutiles.
- **Fix:** replicar el patrón de `products.dto.ts` por columna: cantidades `Decimal(_,3)` → `@IsNumber({maxDecimalPlaces:3})`+`@Max(999999.999)`; importes `Decimal(12,2)` → `maxDecimalPlaces:2`+`@Max(9999999999.99)`; `unitCost Decimal(10,4)` → `maxDecimalPlaces:4`+`@Max(999999.9999)`. Centralizar las constantes (como `MAX_PRICE`).

### A-04 · [LOW, conf. 7] AuthGuard no revalida estado del usuario

- **Ubicación:** `apps/api/src/auth/auth.guard.ts:55-63`.
- **Descripción:** solo verifica la firma del JWT; no consulta `User.active`/`role`. Un usuario desactivado o degradado conserva privilegios hasta caducar el access token (TTL 15 min). El `refresh` sí bloquea inactivos, así que la ventana es ≤15 min, no renovable.
- **Fix:** revalidación ligera (cache de pocos segundos de `active`+`role`, o lista de revocación por `jti`/`userId` en Redis al desactivar), o bajar el TTL del access token.

### A-05 · [LOW, conf. 7] `.dockerignore` no excluye `.env*`

- **Ubicación:** `.dockerignore`; `apps/{tpv,backoffice}/Dockerfile` (`COPY . .`).
- **Descripción:** `.gitignore` excluye `.env*` de git, pero no del contexto de build de Docker. Si se construye en una máquina con un `.env`/`.env.local` que contenga una variable `VITE_`-prefijada sensible, Vite la inlinearía en el bundle público. Hoy las `VITE_*` del proyecto son solo URLs/toggle/DSN (no secretos) → defensa en profundidad.
- **Fix:** añadir `.env`, `.env.local`, `.env.*.local` (manteniendo `!.env.example`) al `.dockerignore`.

### A-06 · [LOW, conf. 7] CSP desactivada

- **Ubicación:** `apps/api/src/main.ts:41` (`helmet({ contentSecurityPolicy: false })`); los `nginx.conf.template` de los frontends tampoco emiten CSP.
- **Descripción:** la justificación (Swagger) ya no aplica en producción (Swagger solo se monta fuera de prod). Una CSP en el nginx de los frontends mitigaría el robo del `accessToken` de `localStorage` ante un eventual XSS.
- **Fix:** CSP restrictiva en la API (`default-src 'none'` para JSON) y cabeceras CSP en los nginx de los SPAs.

---

## Verificado y limpio (preservar)

- **Inyección SQL: NEGATIVO.** Todo el SQL crudo (`dashboard/sales/stock/returns/verifactu/with-tenant-tx/prisma.service`) usa tagged templates parametrizados; **cero** `queryRawUnsafe`/`executeRawUnsafe`; sin `ORDER BY`/columna dinámica desde input. _Único punto a vigilar:_ `eqStore()` usa `Prisma.raw(column)` pero hoy todos los callers pasan nombres de columna **literales del código**.
- **SEC-01 (IDOR cross-store) — REMEDIADO** y verificado endpoint por endpoint: ningún CLERK puede operar en una tienda no asignada (toda escritura store-scoped valida `assertStoreAccess`); el acceso org-wide de ADMIN/MANAGER es intencional.
- **Refresh tokens** con rotación por familia + `jti` + detección de reuso + revocación + cookie httpOnly (SEC-06/SEC-20 remediados).
- **Multi-tenancy/RLS:** `organizationId` siempre del JWT; `set_config` parametrizado; todas las tablas tenant con `FORCE ROW LEVEL SECURITY` y fail-safe a 0 filas; BYPASSRLS solo en el lookup de login/refresh.
- **Secretos:** JWT secrets obligatorios sin default; sin credenciales de producción hardcodeadas; passwords/PIN con bcrypt; tokens con `randomBytes`/`randomUUID`; `passwordHash`/`pinHash` nunca serializados (`PUBLIC_SELECT`).
- **CORS fail-closed** en producción; **Swagger** fuera de prod; **trust proxy** configurable; **body limit** 512kb; **Sentry** con scrubbing y solo en prod; contenedores **no-root**; CI con Actions pinneadas por SHA.
- **Frontends:** 0 `dangerouslySetInnerHTML`/`innerHTML`/`eval`; sin secretos sensibles en bundles `VITE_*`.

---

## Recomendación para la siguiente iteración

**Bloqueante para el cableado backoffice→API real:** corregir **A-02** y **A-01** primero. Hoy el bypass es inocuo porque las libs devuelven demo, pero en cuanto el backoffice consuma datos reales, un login falso por defecto se convierte en _un panel de administración con datos reales sin autenticación_. Orden seguro: (1) `isDemo()` con default = real e invertir el Dockerfile; (2) cablear `POST /auth/login` real; (3) recién entonces sustituir demo por API.

**Aprovechar la iteración:** **A-03** encaja al tocar los DTOs de ventas. Avisos _forward-looking_: la **API pública de stock** debe derivar el `organizationId` de la API key (nunca del input) y pasar revisión de seguridad propia; las **nuevas queries de estadística** deben mantener la parametrización y **no** pasar columnas dinámicas a `eqStore`.

**Prioridad sugerida:** A-02 → A-01 → A-03 → A-06 → A-05 → A-04.
