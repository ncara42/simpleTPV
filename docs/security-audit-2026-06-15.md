# Auditoría de seguridad — simpleTPV (2026-06-15)

- **Fecha:** 2026-06-15
- **Rama:** `main`
- **Metodología:** auditoría multi-agente quirúrgica. Investigación web real (OWASP Top 10
  2021/2025, OWASP API Security Top 10 2023, CVEs 2024-2026 de los paquetes del stack vía
  Firecrawl + Context7) → síntesis de un modelo de amenazas → auditoría granular de **14
  superficies** contra el código real → **verificación adversarial independiente por hallazgo**
  (cada finding refutado leyendo el código, comprobando controles compensatorios). Los hallazgos
  de RLS y validación se re-verificaron a mano tras una caída transitoria de sus verificadores.
- **Cobertura:** 14 superficies (auth/JWT, RLS/multi-tenancy, IDOR/BOLA, inyección, validación,
  concurrencia/TOCTOU, secretos/config, api-keys/dispositivos, rate-limit/DoS, frontend TPV,
  frontend backoffice, web Astro `apps/web` —**nueva, nunca auditada**—, nginx/Docker,
  dependencias/supply-chain).
- **Resultado:** 104 hallazgos crudos → **54 confirmados** / 50 descartados (falsos positivos o
  ya remediados). Severidad de los confirmados: **1 HIGH, 14 MEDIUM, 33 LOW, 6 INFO** (antes de
  deduplicar). Tras deduplicar duplicados exactos y agrupar por causa raíz → **20 issues de
  GitHub** (label `security`).

> Auditorías previas relacionadas: `security-audit-2026-06-03.md` (completa, 23 hallazgos),
> `security-audit-2026-06-05.md`, `security-audit-2026-06-10-ux-branch.md` (delta).

---

## 1. Veredicto general

El **núcleo de seguridad del backend sigue siendo sólido**: la Row-Level Security multi-tenant
está bien construida (el rol de runtime `app` no es owner de ninguna tabla ni tiene `BYPASSRLS`,
por lo que RLS se aplica siempre y el contexto nulo devuelve 0 filas — fail-safe), el SQL está
parametrizado, los secretos JWT son obligatorios, la rotación de refresh tokens es atómica, y las
disputas de la auditoría de seguimiento del 2026-06-06 están **resueltas de verdad** (ver §2).

El hallazgo de mayor severidad es un **bypass del control de "cuatro ojos"** en devoluciones
ciegas (un MANAGER se auto-autoriza con su propio PIN). El resto son MEDIUM/LOW de endurecimiento:
validación de entrada, cabeceras HTTP, configuración de CI/CD y supply-chain, e higiene de
credenciales.

## 2. Disputas previas (2026-06-06) — RESUELTAS contra el código actual

| Disputa                                                 | Estado verificado                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-01** TPV en modo demo por defecto en su Dockerfile  | **CERRADA.** El modo demo es **opt-in** explícito (`ARG VITE_DEMO_MODE` sin default real); el data layer demo se eliminó.                                                                           |
| **A-02** Backoffice login SIEMPRE ADMIN sin toggle      | **CERRADA.** `isDemo()` con default real; el backoffice requiere login real por defecto.                                                                                                            |
| **A-04** AuthGuard no revalida active/role por petición | **PARCIAL.** La revalidación **sí existe** (`revalidate()` consulta active/role con cache de 15 s). Pero es **fail-open** ante error de la BD de auth → queda como issue MEDIUM (residual, ver #3). |
| TOCTOU `voidSale` vs `createReturn` (doble reposición)  | **CERRADA.** Ambos caminos toman `SELECT ... FOR UPDATE`.                                                                                                                                           |
| `confirmInventoryCount` no atómico                      | **CERRADA.** Envuelto en transacción única.                                                                                                                                                         |
| `time-clock create` sin lock/UNIQUE                     | **CERRADA.** Lock/UNIQUE aplicado.                                                                                                                                                                  |
| Rotación de refresh token TOCTOU                        | **CERRADA.** `markUsed` atómico, reuso revoca familia.                                                                                                                                              |

**Hallazgo nuevo que la auditoría previa apuntó pero seguía vivo:** la auto-autorización de
devoluciones ciegas por un MANAGER (ver #1) **sigue explotable** y se eleva a HIGH.

## 3. Falsos positivos relevantes (NO son issues)

- **JWT algorithm confusion** (AUTH-01/IDOR-01/RLS-01/CFG-01): `@nestjs/jwt` sobre `jsonwebtoken`
  v9 **rechaza `alg:none` por defecto** y el secreto simétrico no permite confusión HS/RS sin
  clave pública. El verificador confirmó que no es explotable.
- **`set_config` / `Prisma.raw`** en `dashboard.service.ts`: siempre con parámetro posicional o
  literal interno del código, nunca input de usuario (INJ-04/05).
- **`FEBO-04`** prototype pollution en `parseCsvRows` cliente: no explotable (validación + uso).
- **Demo mode en producción** (múltiples surfaces): opt-in verificado, ver §2.

---

## 4. Hallazgos confirmados → issues

Cada issue de GitHub (label `security`) es autocontenida. Las **20 issues publicadas** son
**[#104–#123](https://github.com/marcogmurciano/simpleTPV/issues?q=is%3Aissue+label%3Asecurity)**
(el número interno `#N` de abajo equivale a **GitHub #(N+103)**: `#1`→[#104], `#2`→[#105], …,
`#20`→[#123]). Mapa de IDs internos de auditoría:

### HIGH

**#1 — Bypass de "cuatro ojos": un MANAGER auto-autoriza su devolución ciega**
`(RACE-01, IDOR-02)` · CWE-285 / OWASP API5:2023 BFLA · `area:api`
`resolveAuthorizer(managerPin)` (returns.service.ts:247-264) busca cualquier MANAGER/ADMIN del
tenant cuyo PIN coincida, **sin excluir al iniciador** (`userId`). Un MANAGER llama
`POST /returns/blind` con su propio PIN → `authorizedBy === userId`. El control de doble
aprobación queda anulado; permite reposición de stock ficticia + abono sin ticket. Fix: pasar
`userId` y añadir `id: { not: userId }` al `where`.

### MEDIUM

**#2 — RLS sin `WITH CHECK` en 33 tablas (escritura cross-tenant latente)** `(RLS-06)` · CWE-285 ·
`area:db`. Solo 4 tablas (`CashMovement`, `OfficialDevice`, `TimeClockEntry`, `RefreshToken`)
tienen `WITH CHECK`; las demás solo `USING`. **No explotable hoy** (el `organizationId` de los
inserts siempre viene del contexto JWT, nunca de un DTO), pero es una **bomba de relojería**:
cualquier endpoint futuro que tome `organizationId` del input permitiría inyectar filas en otro
tenant. Fix: añadir `WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)` a las 33 policies.

**#3 — AuthGuard fail-open en la revalidación de sesión (A-04 residual)**
`(KEY-07, INJ-03, VAL-08, RACE-03, FEBO-02)` · CWE-280 · `area:api`. `revalidate()`
(auth.guard.ts:80-96) hace `catch { return; }`: si el lookup de estado falla (BD de auth caída),
la verificación de active/role se omite y el token conserva sus privilegios hasta expirar (≤15 m).
Un usuario desactivado/degradado cuyo lookup falle sigue operando. Fix: fail-closed selectivo para
roles privilegiados o caché con TTL + bajar TTL del access token.

**#4 — bcryptjs trunca a 72 bytes sin `@MaxLength` en contraseñas** `(CFG-02, AUTH-02, IDOR-03)` ·
CWE-916 · `area:api`. `CreateUserDto`/`UpdateUserDto.password` solo tienen `@MinLength(8)`; la rama
CSV (users.service.ts:83) tampoco valida; `LoginDto` permite 128. bcryptjs descarta los bytes 73+
en silencio → dos contraseñas con el mismo prefijo de 72 bytes colisionan. Fix: `@MaxLength(72)`
en todos los campos password (o pre-hash SHA-256).

**#5 — CSV/Formula Injection en exports (ventas, contabilidad, compras)** `(INJ-01)` · CWE-1236 ·
`area:api`. La función `esc()` (sales.service.ts:670, accounting-export.ts:30, purchases.service.ts:224)
solo entrecomilla ante `,`/`"`/`\n`; no neutraliza `=`, `+`, `-`, `@`, `\t`, `\r`. Un nombre de
producto `=cmd|'/C calc'!A0` se ejecuta al abrir el CSV en Excel del receptor (gestoría). Fix:
prefijar con `'` los campos que empiezan por carácter de fórmula; centralizar en `csv.ts`.

**#6 — TOCTOU en `createMovement` de caja (movimiento sobre sesión cerrada)** `(RACE-02)` ·
CWE-367 · `area:api`. `createMovement` (cash-sessions.service.ts:196-218) lee estado con `findFirst`
y crea el movimiento sin transacción ni lock; un `close` concurrente cuela un movimiento en una
sesión `CLOSED`, corrompiendo el cuadre. Fix: `$transaction` + `SELECT ... FOR UPDATE` o
`INSERT ... WHERE EXISTS (... status='OPEN')`.

**#7 — DoS autenticado: el import CSV de usuarios ejecuta 500 bcrypt en paralelo** `(DOS-03)` ·
CWE-400 · `area:api`. `users.service.ts:96-103` hace `Promise.all` de hasta `MAX_IMPORT_ROWS=500`
hashes bcrypt (10 rondas) sin `@Throttle` propio; un ADMIN satura el event loop de la réplica
única. Fix: `@Throttle` por endpoint + concurrencia acotada (lotes de ~10).

**#8 — Endurecimiento de validación de entrada en DTOs** `(VAL-02, VAL-03, VAL-06, VAL-07, KEY-04, INJ-02)` ·
CWE-20 · `area:api`. Faltan límites: `@ArrayMaxSize` en `CreateWholesaleOrderDto.lines` (b2b) y
`AssignStoresDto.storeIds`; `@MaxLength` en ~35 campos string (productos, tiendas, proveedores,
familias, devoluciones, dispositivos, etc.); `@Max` en `page` de `ListSalesQueryDto` y
`ListWholesaleOrdersQueryDto` (OFFSET ilimitado); `@Max`/`@IsInt` en `daysCoverage`
(aritmética con Infinity). Fix: añadir decoradores con límites semánticos (ver checklist en la
issue).

**#9 — Imágenes Docker sin escaneo Trivy en CI (job `image-scan` TODO)** `(CFG-07, FEBO-06, INFRA-04, DEP-01)` ·
CWE-1104 · `area:infra`. `trivy.yml:30-36` deja el `image-scan` comentado pese a existir los 4
Dockerfiles; solo corre filesystem-scan. CVEs de las imágenes base (`node:22-slim`,
`nginx-unprivileged:1.27-alpine`, etiquetas mutables) no se detectan. Fix: activar el job +
pinnear bases por digest.

**#10 — Cabeceras de seguridad nginx incompletas (HSTS, Permissions-Policy) y no heredadas**
`(FEBO-03, INFRA-01, CFG-03, CFG-04, AUTH-06, FETPV-02, INFRA-02, FETPV-01, WEB-01)` · CWE-693/1021/614 ·
`area:infra`. `apps/tpv` y `apps/backoffice` omiten HSTS y Permissions-Policy (sí presentes en
`apps/web`); además los `location` de assets (`/assets/`, `/_astro/`, `/fonts/`) anulan la herencia
de `add_header`. Fix: añadir las cabeceras en server + repetir/incluir en cada location;
`server_tokens off`.

**#11 — La CSP `script-src 'self'` rompe la hidratación de la isla DashboardDemo en `apps/web`**
`(WEB-02)` · CWE-1021 · `area:web`. La CSP de `apps/web/nginx.conf.template:14` bloquea los dos
`<script>` inline (no-module) que Astro emite para la hidratación `client:visible` (IntersectionObserver

- devalue); la demo nunca hidrata en producción. El comentario justifica la CSP con "no ejecuta JS"
  (incorrecto). Fix: `'unsafe-inline'` en script-src (sitio estático, riesgo XSS residual bajo) o
  CSP con nonce vía capa SSR.

**#12 — El job `deploy` de CI no falla ante respuestas no-2xx de Dokploy** `(INFRA-05)` · CWE-754 ·
`area:infra`. `ci.yml:349-354` emite `::warning::` ante respuestas no-2xx (p.ej. 401) → el deploy
se omite en silencio y el job sale verde. Relacionado con el incidente documentado del 401 de
Dokploy. Fix: decidir fail-fast (cambiar a `exit 1`) o notificar + health-check post-deploy que
compare el SHA desplegado.

### LOW

**#13 — RLS defensa en profundidad** `(RLS-04, RLS-05, RLS-07)` · `area:db`. `FORCE ROW LEVEL
SECURITY` ausente en 28/37 tablas (no explotable: `app` no es owner ni tiene BYPASSRLS, pero
deseable ante una conexión accidental con el rol owner); `UserStore` sin RLS (mitigado por
validación app-level vía RLS en `Store`; añadir filtro de org en `me.controller.ts:78`); falta
test de aislamiento concurrente en `rls.integration.spec.ts`.

**#14 — Higiene de credenciales en api-keys y dispositivos** `(KEY-01, KEY-02, KEY-03)` · `area:api`.
`ApiKey` sin `expiresAt` (vida indefinida, CWE-613); `pairingToken` de dispositivos persistido en
**texto plano** (CWE-312, debería hashearse como las API keys); `POST /devices/pair` no valida que
el `storeId` del CLERK coincida (BOLA intra-tenant, CWE-639).

**#15 — Endurecimiento de Redis/BullMQ/throttler** `(INFRA-03, DOS-07, DOS-01, DOS-06)` · `area:infra`.
Redis sin `requirepass` ni pin de versión (exposición a CVE-2025-49844 _RediShell_ RCE CVSS 10 si
la imagen resuelve <7.4.3); conexiones BullMQ sin TLS explícito (no fuerza `rediss:`); jobs sin
`removeOnComplete/removeOnFail` (acumulación en Redis); throttler en memoria (eludible al escalar a
múltiples réplicas — migrar a storage Redis antes de escalar).

**#16 — Rate limiting y consultas sin cota** `(AUTH-04, DOS-02, CFG-05, DOS-04)` · `area:api`.
`/auth/refresh` y `/auth/logout` sin `@Throttle` dedicado (solo el global 120/min); endpoints de
historial de fichaje sin paginación ni límite de rango de fechas. Fix: `@Throttle` en refresh +
`take`/rango máximo en time-clock.

**#17 — Sentry `beforeSend` no elimina `event.request.data`** `(CFG-08)` · CWE-532 · `area:api`.
El scrubbing no borra el body de la request → posible captura de contraseñas/tokens en errores.
Fix: `delete event.request.data` en `scrubSensitive`.

**#18 — `accessToken` JWT en localStorage** `(AUTH-05, FETPV-05)` · CWE-922 · `area:tpv` `area:backoffice`.
Riesgo ya aceptado (S-08). Tracking: migrar a `sessionStorage` (cambio de una línea) reduce la
exposición a XSS persistente entre pestañas/reinicios.

**#19 — Higiene de dependencias y CI** `(CFG-06, DEP-02, FEBO-05, INFRA-06, DEP-03)` · `area:infra`.
`pnpm audit` con `continue-on-error: true` (advisories HIGH no bloquean el pipeline);
`yaml@2.7.1` con GHSA-48c2-rrv3-qjmp (Stack Overflow) en la cadena devDep de `apps/web`. Fix:
quitar `continue-on-error` (con ignores documentados si hace falta) + override `yaml: '>=2.8.3'`.

### INFO

**#20 — Hardening menor** `(WEB-03, KEY-05, KEY-06, FETPV-03)` · varias. Astro revela su versión vía
`<meta name="generator">`; `P2002` filtra el nombre de columna interno `hashedKey` en errores;
`touchLastUsed()` sin captura de error (traza de uso de API key perdida en silencio);
`useHealthCheck` es un stub permanente (`always true`) en el TPV.

---

## 5. Apéndice — descartados por verificador caído y recuperados a mano

Durante la verificación adversarial, 17 verificadores cayeron por errores transitorios de socket;
sus hallazgos (RLS-01..07, VAL-01..06, DOS-05/08/09/10) cayeron a "descartados" por veredicto nulo,
**no por ser falsos**. Se re-verificaron a mano:

- **RLS-01/02/03, VAL-01/04/05, DOS-05/08/09/10**: duplicados de hallazgos ya confirmados o
  disputas ya resueltas (mapeados arriba).
- **RLS-04/05/06/07, VAL-02/03/06**: re-verificados contra el schema/migraciones/DTOs reales →
  incorporados como issues #2, #8, #13 con su severidad honesta.

## 6. Tabla resumen por superficie

| Superficie          | Confirmados              | Issue(s)                           |
| ------------------- | ------------------------ | ---------------------------------- |
| concurrency         | RACE-01/02/03            | #1, #3, #6                         |
| rls-tenancy         | RLS-04/05/06/07          | #2, #13                            |
| auth-jwt            | AUTH-02/04/05/06         | #3, #4, #10, #16, #18              |
| authz-idor          | IDOR-02/03               | #1, #4                             |
| injection           | INJ-01/02/03             | #3, #5, #8                         |
| input-validation    | VAL-02/03/06/07/08       | #3, #8                             |
| secrets-config      | CFG-02/03/04/05/06/07/08 | #4, #7→DOS, #9, #10, #16, #17, #19 |
| api-keys-devices    | KEY-01..07               | #3, #14, #20                       |
| rate-dos            | DOS-01/02/03/04/06/07    | #7, #15, #16                       |
| frontend-tpv        | FETPV-01/02/03/05        | #10, #18, #20                      |
| frontend-backoffice | FEBO-02/03/05/06         | #3, #9, #10, #19                   |
| web-astro           | WEB-01/02/03             | #10, #11, #20                      |
| nginx-docker        | INFRA-01..06             | #9, #10, #12, #15, #19             |
| deps-supplychain    | DEP-01/02/03             | #9, #19                            |
