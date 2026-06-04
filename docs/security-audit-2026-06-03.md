# Auditoría de seguridad — simpleTPV

- **Fecha:** 2026-06-03
- **Alcance:** todo el repositorio — `apps/api` (NestJS), `apps/tpv` y `apps/backoffice` (React/Vite), `packages/*` (`auth`, `db`, `ui`, `web-config`), infraestructura (`Dockerfile`s, `docker-compose.yml`, `infra/`) y CI/CD (`.github/workflows`).
- **Metodología:** auditoría multi-agente (12 dimensiones de seguridad en paralelo → verificación adversarial con 3 lentes independientes por hallazgo: _alcanzabilidad_, _explotabilidad/impacto_ y _corrección técnica_ → síntesis), apoyada en el plugin `security-guidance@claude-plugins-official` (taxonomía: injection, XSS, SSRF, secrets, IDOR, auth bypass, deserialización, path traversal, crypto débil, command/CI injection) y en verificación manual independiente de todos los hallazgos HIGH y de los controles núcleo (RLS, auth, manejo de secretos).
- **Resultado bruto del barrido:** 47 hallazgos candidatos → 29 confirmados, 2 en disputa, 16 refutados (falsos positivos descartados por la verificación adversarial). Tras fusionar duplicados detectados por varias dimensiones, quedan **23 hallazgos distintos**.

> **Nota de severidad.** Cuando el agente que descubrió un hallazgo y los verificadores adversariales discreparon en la severidad, este informe usa la **severidad ajustada por los verificadores** (señal más rigurosa) y lo indica explícitamente. Las severidades reflejan una API multi-tenant de TPV en producción.

---

## Resumen ejecutivo

El andamiaje de seguridad del backend es **sólido en lo esencial**: aislamiento multi-tenant por Row-Level Security con `FORCE` y _fail-safe_ a 0 filas, guards globales (throttler → auth → roles), secretos JWT obligatorios sin defaults, SQL crudo siempre parametrizado, `passwordHash`/`pinHash` nunca expuestos, login con throttle anti-fuerza-bruta, dependencias sin CVEs conocidos (`pnpm audit` limpio) y contenedores no-root con Actions de CI pinneadas por SHA.

El riesgo se concentra en **una clase de fallo de autorización** y en **cumplimiento/fiabilidad fiscal (VeriFactu)**:

1. **IDOR horizontal entre tiendas de la misma organización** (HIGH): RLS aísla por _organización_ pero no por _tienda_, y las operaciones de escritura confían en el `storeId` del cliente sin comprobar la asignación `UserStore`. La única comprobación de pertenencia existe pero solo se aplica al _listado_ de ventas para `CLERK`.
2. **El registro fiscal VeriFactu es best-effort** (HIGH): se crea en un callback `afterCommit` cuyo error se descarta silenciosamente → ventas confirmadas sin registro fiscal, y las devoluciones no generan registro rectificativo.
3. **Agotamiento de recursos vía SSE/Redis** (HIGH): cada conexión SSE abre una conexión Redis dedicada sin tope de concurrencia.

| Severidad                        | Nº hallazgos distintos |
| -------------------------------- | ---------------------- |
| **HIGH**                         | 3                      |
| **MEDIUM**                       | 8                      |
| **LOW**                          | 12                     |
| **En disputa** (revisión humana) | 2                      |
| **Total**                        | 25                     |

---

## Tabla de hallazgos confirmados

| ID     | Sev.   | CWE      | Título                                                                                                                | Ubicación principal                                                                     |
| ------ | ------ | -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| SEC-01 | HIGH   | CWE-639  | IDOR cross-store intra-org: las escrituras confían en `storeId` del cliente sin validar `UserStore`                   | `apps/api/src/sales/sales.service.ts` (+caja, stock, returns, time-clock)               |
| SEC-02 | HIGH   | CWE-755  | Registro VeriFactu en `afterCommit` best-effort: la venta se confirma aunque el registro fiscal falle silenciosamente | `apps/api/src/sales/sales.service.ts:391-407`, `prisma/with-tenant-tx.ts:33-40`         |
| SEC-03 | HIGH   | CWE-770  | SSE `/events` abre una conexión Redis por suscripción sin límite de concurrencia                                      | `apps/api/src/events/redis-event-bus.ts:36-60`                                          |
| SEC-04 | MEDIUM | CWE-489  | El build de producción del TPV queda en modo DEMO (login falso) por defecto                                           | `apps/tpv/Dockerfile`, `apps/tpv/src/lib/api-config.ts:7-9`                             |
| SEC-05 | MEDIUM | CWE-489  | El backoffice no tiene modo real: login siempre acepta cualquier credencial como ADMIN                                | `apps/backoffice/src/lib/auth.ts:12-21`                                                 |
| SEC-06 | MEDIUM | CWE-613  | Refresh tokens sin rotación, revocación ni `jti`: un token robado vale 7 días                                         | `apps/api/src/auth/auth.service.ts:56-82`                                               |
| SEC-07 | MEDIUM | CWE-840  | Las devoluciones/abonos no generan registro VeriFactu `RECTIFICATION`                                                 | `apps/api/src/returns/returns.service.ts`                                               |
| SEC-08 | MEDIUM | CWE-307  | Rate limiting inoperante tras proxy (falta `trust proxy`) y en memoria entre réplicas                                 | `apps/api/src/main.ts`, `app.module.ts:41`                                              |
| SEC-09 | MEDIUM | CWE-770  | Endpoints de listado sin paginación / `pageSize` sin tope → resultset ilimitado                                       | `verifactu`, `transfers`, `returns`, `products`, `stock/movements`                      |
| SEC-10 | MEDIUM | CWE-770  | Arrays de líneas sin `@ArrayMaxSize` en DTOs transaccionales                                                          | `apps/api/src/sales/sales.dto.ts:42-46` (+compras, traspasos, devoluciones, inventario) |
| SEC-11 | MEDIUM | CWE-840  | El cuadre de cierre de caja no descuenta los reembolsos en efectivo                                                   | `apps/api/src/cash-sessions/cash-sessions.service.ts:71-136`                            |
| SEC-12 | LOW    | CWE-20   | DTOs de `/auth/login` y `/auth/refresh` son `interface` TS → la `ValidationPipe` no valida                            | `apps/api/src/auth/auth.controller.ts:8-38`                                             |
| SEC-13 | LOW    | CWE-613  | El AuthGuard no revalida `active`/rol en cada petición (ventana de hasta 15 min)                                      | `apps/api/src/auth/auth.guard.ts:55-63`                                                 |
| SEC-14 | LOW    | CWE-208  | Enumeración de cuentas por timing en `validateUser` (no ejecuta bcrypt si el usuario no existe)                       | `apps/api/src/auth/auth.service.ts:37-47`                                               |
| SEC-15 | LOW    | CWE-20   | Importes/precios sin `@Max` ni `maxDecimalPlaces` → overflow de `Decimal` = 500                                       | `apps/api/src/products/products.dto.ts:18-42`                                           |
| SEC-16 | LOW    | CWE-20   | El import CSV de productos no reutiliza la validación del DTO: acepta precios negativos                               | `apps/api/src/products/products.service.ts:82-99`                                       |
| SEC-17 | LOW    | CWE-1295 | Swagger/OpenAPI expuesto incondicionalmente en producción                                                             | `apps/api/src/main.ts:42-51`                                                            |
| SEC-18 | LOW    | CWE-942  | `CORS_ORIGINS` sin definir cae a orígenes localhost de desarrollo (fail-open de config)                               | `apps/api/src/config/security.ts:14-22`                                                 |
| SEC-19 | LOW    | CWE-307  | Sin protección anti-fuerza-bruta específica para el PIN de autorización (devolución ciega)                            | `apps/api/src/returns/returns.service.ts:182-199`                                       |
| SEC-20 | LOW    | CWE-522  | `accessToken` y `refreshToken` persistidos en `localStorage` (robables por XSS)                                       | `packages/auth/src/auth-store.ts:47-62`                                                 |
| SEC-21 | LOW    | CWE-1357 | Imagen Semgrep en CI sin pinnear por digest (tag mutable `:latest`)                                                   | `.github/workflows/security.yml:52-53`                                                  |
| SEC-22 | LOW    | CWE-778  | Fallos de escritura del audit log descartados silenciosamente                                                         | `apps/api/src/audit/audit.interceptor.ts:40-52`                                         |
| SEC-23 | LOW    | CWE-778  | Eventos de autenticación (login OK/KO, refresh) no se auditan                                                         | `apps/api/src/audit/audit.interceptor.ts:30-32`                                         |

---

## Hallazgos detallados

### SEC-01 · [HIGH] IDOR cross-store intra-org — las escrituras confían en el `storeId` del cliente sin validar `UserStore`

- **Ubicación:** `apps/api/src/sales/sales.service.ts:259-411` (y el patrón se repite en cash-sessions, stock, returns, time-clock). CWE-639. _Confirmado 3/3, severidad ajustada HIGH. Fusión de 3 hallazgos independientes (dimensiones authz-idor, business-logic-money, multi-tenancy-rls)._
- **Descripción:** El modelo de seguridad asigna usuarios a tiendas concretas vía la tabla `UserStore`, y el backend reconoce esa frontera: `salesStoreFilter` (`sales.service.ts:648-670`) restringe el **listado** de ventas de un `CLERK` a sus tiendas asignadas y lanza `ForbiddenException('No tienes acceso a esa tienda')`. Pero esa comprobación **solo se invoca desde `findSales`**. Todas las operaciones **mutadoras** y de lectura por tienda toman el `storeId` del body/query y solo lo validan contra la _organización_ (RLS), nunca contra `UserStore`. Como RLS aísla por organización pero **no por tienda** (y `UserStore` además no tiene política RLS propia — ver SEC verificado-limpio), la frontera por tienda depende enteramente del código de aplicación, que aquí no la comprueba.
- **Escenario de ataque:** Un `CLERK` de la organización X asignado solo a la tienda A obtiene el `storeId` de la tienda B (no es secreto: `GET /me/stores` devuelve **todas** las tiendas de la org). Entonces:
  - `POST /sales` con `{storeId: B, ...}` → registra una venta en la caja de B (si B no tiene caja abierta, primero `POST /cash-sessions/open {storeId: B}`).
  - `POST /cash-sessions/{idCajaB}/close` con `countedAmount` falseado → descuadra la caja de B.
  - `POST /stock/adjust {storeId: B}` / `POST /returns/blind {storeId: B}` → manipula inventario/efectivo de una tienda ajena.
- **Impacto:** Corrupción del cuadre de caja, inventario, histórico de ventas y registros fiscales de cualquier tienda de la org por un operario sin acceso a ella. No cruza organizaciones (RLS lo impide), por eso HIGH y no CRITICAL.
- **Remediación:** Centralizar `assertStoreAccess(userId, role, storeId)` — verificar que existe `UserStore(userId=req.user.sub, storeId)` para roles no-`ADMIN` antes de cualquier operación con `storeId` del cliente. Extraer la lógica de `salesStoreFilter` a un guard/decorador reutilizable (p.ej. `@RequireStoreAccess`) y aplicarlo en `sales.create`/`voidSale`, `cash-sessions.open/close/current/createMovement`, `stock.byStore/setMin/adjust/confirmInventoryCount`, `returns.create/createBlind`, `transfers.receive`, `store-orders.receive` y `time-clock`. Decidir y documentar si `MANAGER` es global de org o limitado a sus `UserStore` (el comentario de `me.controller.ts:26-27` sugiere lo segundo). Añadir test e2e que verifique 403 al operar sobre tienda no asignada.

### SEC-02 · [HIGH] Registro VeriFactu en `afterCommit` best-effort — la venta se confirma aunque el registro fiscal falle

- **Ubicación:** `apps/api/src/sales/sales.service.ts:391-407` + `apps/api/src/prisma/with-tenant-tx.ts:33-40`. CWE-755. _Confirmado 3/3, HIGH._
- **Descripción:** El registro VeriFactu de cada venta se genera en un callback `afterCommit`. Según `withTenantTx`, los callbacks `afterCommit` son best-effort: si lanzan, la excepción se traga en un `catch {}` vacío y no se propaga ni reintenta. Una venta puede confirmarse en BD (Sale creada, stock movido, ticket emitido) mientras `verifactu.recordFor` falla (error al insertar `VerifactuRecord`, fallo leyendo `organization.nif`, contención del advisory lock, timeout). Resultado: factura sin registro VeriFactu correspondiente, **sin hueco visible, sin marca de error y sin reintento** desde la UI.
- **Escenario de ataque:** No requiere atacante — cualquier indisponibilidad transitoria de BD durante el `afterCommit` produce el hueco. El RD 1007/2023 (Reglamento VeriFactu) exige que **toda** factura genere su registro de facturación encadenado; este patrón produce descuadres no detectables entre la facturación real y la cadena VeriFactu remitida a la AEAT (incumplimiento sancionable).
- **Remediación:** El registro fiscal no es un efecto secundario opcional. Preferible: (a) crear el `VerifactuRecord` **dentro de la misma transacción** de la venta, de modo que su fallo haga rollback de la venta; o (b) insertar una fila `PENDING` dentro de la tx y solo encolar el _envío_ en `afterCommit`, garantizando que el registro siempre exista; y (c) en todo caso, un proceso de reconciliación que detecte `Sale` sin `VerifactuRecord` y alerte. Nunca tragar el error del registro fiscal en un `catch` vacío.

### SEC-03 · [HIGH] SSE `/events` abre una conexión Redis por suscripción sin límite de concurrencia

- **Ubicación:** `apps/api/src/events/redis-event-bus.ts:36-60` (endpoint en `events.controller.ts`, `@Sse() @Roles('ADMIN','MANAGER','CLERK')`). CWE-770. _Confirmado 3/3, verificadores divididos MEDIUM/HIGH; se mantiene HIGH por el radio de impacto (toda la API)._
- **Descripción:** Cada suscripción SSE crea una conexión Redis nueva y dedicada (`subFactory()`), un timer de heartbeat y un socket HTTP de larga duración. No hay límite de conexiones concurrentes por usuario, organización ni global. El throttler global limita _peticiones por ventana de tiempo_, no _conexiones simultáneas de larga duración_ — una conexión SSE es una sola petición que se mantiene abierta indefinidamente.
- **Escenario de ataque:** Un usuario autenticado de cualquier rol/tenant abre N conexiones a `/events` (con un cliente que soporte cabeceras, p.ej. `fetch-event-source`) y no las cierra. Cada una consume una conexión Redis; al alcanzar el `maxclients` de Redis, el resto de la API (cache, event bus, otras réplicas) deja de poder conectar → degradación/caída para **todos** los tenants. También agota sockets/descriptores del proceso Node.
- **Remediación:** Limitar conexiones SSE concurrentes por usuario/organización (contador en memoria o Redis; 429 al superar p.ej. 3-5). Considerar multiplexar todas las suscripciones de un tenant sobre **una sola** conexión Redis en modo subscribe con fan-out interno. Añadir cap de duración y monitorizar `connected_clients` de Redis.

### SEC-04 · [MEDIUM] El build de producción del TPV queda en modo DEMO por defecto

- **Ubicación:** `apps/tpv/Dockerfile` + `apps/tpv/src/lib/api-config.ts:7-9` + `apps/tpv/src/lib/auth.ts:15-26`. CWE-489. _Confirmado 2/3, severidad ajustada MEDIUM (el descubridor propuso HIGH)._
- **Descripción:** `isDemo()` devuelve `import.meta.env.VITE_DEMO_MODE !== 'false'`, es decir, **demo es el valor por defecto**; solo la cadena exacta `'false'` activa el modo real. Vite congela ese valor en el bundle en tiempo de build. El `Dockerfile` del TPV ejecuta `pnpm build` **sin declarar `VITE_DEMO_MODE` como ARG ni fijarlo** (a diferencia de `VITE_BACKOFFICE_URL`, que sí se declara). Si el operador no pasa el build-arg, la imagen "de producción" se hornea en modo demo, donde `login()` acepta cualquier credencial y guarda un `DEMO_JWT` (`alg:none`) sin contactar la API.
- **Impacto (con matiz honesto):** En demo el cliente **no llega a la API real** (las libs devuelven datos hardcoded y el `DEMO_JWT` `alg:none` es rechazado por el `AuthGuard` real), por lo que **no hay fuga de datos reales ni acceso cross-tenant**. El daño es de **integridad de release**: se despliega públicamente una aplicación con login falso que acepta cualquier credencial, en lugar del producto real. De ahí MEDIUM.
- **Remediación:** Invertir el default o forzar el valor en el build: (a) declarar `ARG VITE_DEMO_MODE` + `ENV VITE_DEMO_MODE=$VITE_DEMO_MODE` en el Dockerfile con `false` por defecto; o, preferible, (b) cambiar `isDemo()` a opt-in explícito (`=== 'true'`) para que un build de producción **nunca** caiga en demo por omisión. Añadir un smoke test de deploy que falle si el login acepta credenciales inválidas.

### SEC-05 · [MEDIUM] El backoffice no tiene modo real: login siempre acepta cualquier credencial como ADMIN

- **Ubicación:** `apps/backoffice/src/lib/auth.ts:12-21` (+ `demo/demoData.ts`). CWE-489. _Confirmado 3/3, severidad ajustada MEDIUM._
- **Descripción:** A diferencia del TPV, el backoffice **no tiene toggle de demo** (no hay `VITE_DEMO_MODE` ni `isDemo()` en todo `apps/backoffice`). `auth.ts` sobrescribe `login()` **incondicionalmente** para guardar `DEMO_JWT` (`{sub:'demo', organizationId:'demo-org', role:'ADMIN'}`, `alg:none`). `App.tsx` solo comprueba `accessToken!==null` y `getRole()==='ADMIN'` (que lee el claim **sin verificar firma**). Cualquiera con la URL entra como ADMIN al panel completo (Dashboard, Catálogo, Stock, Usuarios, Tiendas, Ventas) con datos demo hardcoded.
- **Impacto (con matiz honesto):** El `DEMO_JWT` `alg:none` es rechazado por el `AuthGuard` real (HMAC), así que las pocas llamadas reales (`/stock/adjust`, `/products/import`) fallan con 401 → **no hay lectura/escritura cross-tenant real**. Refleja que la Fase 2 cableó el TPV pero el backoffice sigue siendo un cascarón de demo. El riesgo es desplegar un panel de administración con bypass total de login. MEDIUM.
- **Remediación:** Antes de exponer el backoffice en producción, cablear la autenticación real (`setup.api.login` → `POST /auth/login`) y sustituir los datos demo por llamadas a la API, idealmente con el toggle `isDemo()` del TPV pero con **default = real**. Mientras siga siendo demo, no desplegarlo en URL pública o protegerlo a nivel de infraestructura (basic-auth/IP allowlist en nginx). Documentar explícitamente el estado "solo demo".

### SEC-06 · [MEDIUM] Refresh tokens sin rotación, revocación ni `jti`

- **Ubicación:** `apps/api/src/auth/auth.service.ts:56-82`. CWE-613. _Confirmado 2/2, MEDIUM._
- **Descripción:** El refresh token es un JWT autónomo `{sub}` con TTL de 7 días. `refresh` solo verifica firma/expiración y `user.active`; emite un nuevo accessToken pero **no rota el refresh**, no hay almacén de tokens, ni `jti`, ni lista negra. Un refresh filtrado (XSS sobre `localStorage` — ver SEC-20, backup, log, proxy comprometido) permite renovar accessTokens hasta 7 días, sin posibilidad de invalidarlo salvo desactivar al usuario o rotar `JWT_REFRESH_SECRET` (que invalida a todos). El logout del cliente solo borra el store local; no hay revocación server-side ni detección de reuso.
- **Remediación:** Rotación con detección de reuso: persistir un `jti`/hash por sesión (BD/Redis), emitir un nuevo refresh en cada `refresh` e invalidar el anterior; si llega un refresh ya consumido, revocar toda la familia. Endpoint de logout server-side que revoque el `jti`. Como mínimo, reducir `refreshTtl` y soportar lista de revocación.

### SEC-07 · [MEDIUM] Las devoluciones/abonos no generan registro VeriFactu `RECTIFICATION`

- **Ubicación:** `apps/api/src/returns/returns.service.ts`. CWE-840. _Confirmado 2/3, severidad ajustada MEDIUM (cumplimiento)._
- **Descripción:** El esquema y el código contemplan el tipo `RECTIFICATION` (`verifactu.hash.ts`, enum en la migración), pero `ReturnsService.create`/`createBlind` **nunca** llaman a `verifactu.recordFor` (verificado: `grep` no encuentra ninguna referencia a verifactu en `apps/api/src/returns`; `recordFor` solo se invoca desde `sales.service`). Cada `Return` (abono que reduce base imponible e IVA repercutido) se procesa sin registro fiscal rectificativo.
- **Impacto:** Bajo el Reglamento VeriFactu, las facturas rectificativas/abonos también deben generar su registro encadenado. La cadena remitida a la AEAT no reflejaría los abonos → descuadre fiscal. Es **deuda de cumplimiento** y solo materializa daño cuando el proveedor VeriFactu real esté en producción (hoy es sandbox — ver D1).
- **Remediación:** Añadir en `create`/`createBlind`, de forma consistente con ventas (idealmente dentro de la tx, ver SEC-02), `verifactu.recordFor({ type: 'RECTIFICATION', returnId, payload: {...} })` con el importe rectificativo y la referencia a la factura original, según el formato AEAT.

### SEC-08 · [MEDIUM] Rate limiting inoperante tras proxy y en memoria entre réplicas

- **Ubicación:** `apps/api/src/main.ts` + `apps/api/src/app.module.ts:41`. CWE-307. _Fusión de dos hallazgos (MEDIUM + LOW); resultante MEDIUM._
- **Descripción:** (1) `main.ts` nunca configura `app.set('trust proxy', ...)`. El `getTracker` por defecto de `@nestjs/throttler` usa `req.ip`; tras el proxy nginx/Dokploy, `req.ip` es la IP del proxy — **la misma para todos los clientes**. El límite de login (`@Throttle 5/min`) y el global (120/min) pasan a ser un único cubo compartido por toda la flota: degrada la protección anti-fuerza-bruta y puede auto-DoS-ear a usuarios legítimos. (2) `ThrottlerModule.forRoot` usa almacenamiento **en memoria**; en producción multi-réplica (confirmado por `events.module.ts`), el límite efectivo es 5×N/min. _Express sin `trust proxy` ignora `X-Forwarded-For`, así que no hay spoofing, pero el throttling deja de ser fiable._
- **Remediación:** `app.set('trust proxy', <nº de saltos reales>)` tras crear la app (con `NestExpressApplication`), ajustado a la topología del ingress para no habilitar spoofing. Usar un `ThrottlerStorage` respaldado por Redis para contadores compartidos entre réplicas. Test que verifique cubos separados por IP tras el proxy.

### SEC-09 · [MEDIUM] Endpoints de listado sin paginación / `pageSize` sin tope

- **Ubicación:** `verifactu.service.ts:174-184`, `transfers.service.ts:230` (con `include`), `returns.service.ts:274`, `purchases.service.ts:109`, `cash-sessions.service.ts:158`, `products.service.ts:39`, y `stock.controller.ts:73-89` (`pageSize` sin `@Max`). CWE-770. _Fusión de dos hallazgos, MEDIUM._
- **Descripción:** Varios listados ejecutan `findMany` sin `take`, devolviendo **todas** las filas del tenant; las tablas afectadas (registros VeriFactu, traspasos, devoluciones, movimientos de stock) crecen indefinidamente. `GET /stock/movements` además toma `pageSize` del querystring sin validar máximo (`take: Number(pageSize)`), permitiendo `pageSize=100000000`. A diferencia de `findSales` (que sí valida `@Max(100)`), aquí no hay tope.
- **Escenario de ataque:** Un usuario autenticado de un tenant con histórico grande repite `GET /verifactu` / `/transfers` / `/stock/movements?pageSize=1e8` → cada respuesta materializa todo el histórico en memoria → agotamiento de memoria/CPU/ancho de banda, degradando la réplica para todos los tenants.
- **Remediación:** Paginación obligatoria con `take` máximo (p.ej. 100) en todos los listados, como ya hace `ListSalesQueryDto`. Sustituir `@Query` sueltos por DTOs validados (`@Type(()=>Number) @IsInt() @Min(1) @Max(100)`). Cap defensivo en servicio (`Math.min(pageSize, 100)`). Exigir filtros por rango de fechas en los listados de mayor crecimiento.

### SEC-10 · [MEDIUM] Arrays de líneas sin `@ArrayMaxSize` en DTOs transaccionales

- **Ubicación:** `sales.dto.ts:42-46` (+ `purchases.dto.ts`, `transfers.dto.ts`, `returns.dto.ts`, `stock.dto.ts`). CWE-770. _Fusión de dos hallazgos, MEDIUM._
- **Descripción:** Los arrays de líneas usan `@ArrayMinSize(1)` pero **ninguno** declara `@ArrayMaxSize`. En `sales.create`, cada línea dispara `applyMovement` **secuencialmente dentro de una única transacción** (lectura de stock, upsert de movimiento, cache, alerta). Un array de miles de líneas (cabe en el body de ~100 kB por defecto de Express, ya que `main.ts` no fija límite) mantiene abierta la transacción y la conexión DB ejecutando N×(varias queries).
- **Escenario de ataque:** Usuario autenticado con caja abierta envía `POST /sales` con miles de líneas → N awaits secuenciales en una tx larga + locks sobre `Store`/`Stock`. Repetido en paralelo, agota el pool de conexiones de Prisma/Postgres.
- **Remediación:** `@ArrayMaxSize(N)` realista (p.ej. 100-200) en todos los arrays de líneas. Fijar explícitamente el límite del body parser en `main.ts` (p.ej. `256kb`). Considerar agrupar movimientos por lote en lugar de N awaits secuenciales.

### SEC-11 · [MEDIUM] El cuadre de cierre de caja no descuenta los reembolsos en efectivo

- **Ubicación:** `apps/api/src/cash-sessions/cash-sessions.service.ts:71-136`. CWE-840. _Confirmado 2/2; verificadores leen LOW, se mantiene MEDIUM por integridad contable._
- **Descripción:** `computeExpected = apertura + ventas CASH COMPLETED + neto de cashMovements manuales`. **No resta los reembolsos en efectivo** de devoluciones, y `returns.service` no crea ningún `CashMovement` al devolver dinero. El efectivo esperado al cierre ignora el dinero que sale del cajón por devoluciones → faltante artificial, o cobertura de una sustracción (el operario saca el importe de un reembolso real y el cuadre no lo refleja). El cierre tampoco vincula ventas a la sesión (`createdAt >= openedAt` sin cota superior ni `cashSessionId`).
- **Remediación:** Incluir los reembolsos en efectivo del turno en el cuadre: restar `Sum(Return.total)` en efectivo de la tienda/ventana, **o** generar un `CashMovement` tipo `OUT` automático al crear una devolución pagada en efectivo (vinculado a la sesión abierta). Vincular ventas/devoluciones a `cashSessionId` para conciliación exacta por turno.

### SEC-12 · [LOW] DTOs de `/auth/login` y `/auth/refresh` son `interface` TS → la `ValidationPipe` no valida

- **Ubicación:** `apps/api/src/auth/auth.controller.ts:8-38`. CWE-20. _Confirmado; el descubridor propuso MEDIUM pero la verificación lo ajustó a LOW._
- **Descripción:** `LoginDto`/`RefreshDto` son `interface` TS, no clases con `class-validator`. La `ValidationPipe` global (whitelist/forbidNonWhitelisted/transform) solo valida clases con metadatos; sobre una interfaz el metatipo en runtime es `Object` y la validación es un no-op. El cuerpo llega crudo: `email`/`password`/`refreshToken` pueden ser objeto/array/número y no se rechazan props extra. **No es un bypass de autenticación** (bcrypt/`verifyAsync` siguen exigiendo credenciales válidas; un email no-string no casa con ninguna fila), de ahí LOW. El impacto real es robustez (posible 500 en vez de 400) y ausencia de límite de tamaño (un password gigante alimenta bcrypt → coste CPU, mitigado por el throttle de 5/min).
- **Remediación:** Convertir a clases decoradas: `@IsEmail() @MaxLength(254) email`, `@IsString() @IsNotEmpty() @MaxLength(128) password`, `@IsString() @IsNotEmpty() refreshToken`.

### SEC-13 · [LOW] El AuthGuard no revalida `active`/rol en cada petición

- **Ubicación:** `apps/api/src/auth/auth.guard.ts:55-63`. CWE-613. _Confirmado, LOW._
- **Descripción:** El AuthGuard solo verifica firma/expiración y vuelca el payload en `req.user`; no consulta BD. La autorización confía en el claim `role` del token. Al desactivar un usuario o bajarle el rol, su accessToken vivo sigue válido hasta expirar (15 min por defecto). El re-chequeo de `active` solo ocurre en login/refresh.
- **Remediación:** Aceptable con TTL corto (15 min) y documentado. Para endurecer: comprobar `active`/rol contra una cache (Redis) en operaciones sensibles, o invalidar sesiones server-side al desactivar/cambiar rol (ligado a SEC-06).

### SEC-14 · [LOW] Enumeración de cuentas por timing en `validateUser`

- **Ubicación:** `apps/api/src/auth/auth.service.ts:37-47`. CWE-208. _Confirmado, LOW._
- **Descripción:** Si el usuario no existe o está inactivo, `validateUser` retorna `null` **sin** ejecutar `bcrypt.compare`. Para un usuario existente y activo sí ejecuta bcrypt (decenas de ms). La diferencia de latencia es un oráculo de enumeración, aun con el mensaje genérico "Credenciales inválidas". El throttle de 5/min/IP lo ralentiza pero no lo elimina.
- **Remediación:** Ejecutar siempre una comparación bcrypt contra un hash dummy precomputado cuando el usuario no exista/inactivo (patrón "dummy hash"), igualando el tiempo de respuesta.

### SEC-15 · [LOW] Importes/precios sin `@Max` ni `maxDecimalPlaces` → overflow de `Decimal` = 500

- **Ubicación:** `apps/api/src/products/products.dto.ts:18-42` (y `qty` en `sales`/`transfers`). CWE-20. _Confirmado, LOW._
- **Descripción:** Los campos monetarios usan `@IsNumber()+@Min(0)` pero nunca `@Max` ni `@IsNumber({maxDecimalPlaces})` (`grep`: 0 usos). `salePrice` mapea a `Decimal(10,4)` y `total/subtotal` a `Decimal(12,2)`. Un `salePrice=1e25` o una `qty` enorme excede la precisión → Postgres rechaza el INSERT → excepción Prisma → **500** (en vez de 400); los decimales extra se truncan silenciosamente. Solo robustez/UX; requiere rol con permiso de escritura.
- **Remediación:** `@IsNumber({maxDecimalPlaces: 4})` (2 para totales) y `@Max` realista en precios; `@Max`/`maxDecimalPlaces` en `qty`/cantidades/importes, alineados con la precisión de cada columna `Decimal`.

### SEC-16 · [LOW] El import CSV de productos no reutiliza la validación del DTO → precios negativos

- **Ubicación:** `apps/api/src/products/products.service.ts:82-99`. CWE-20. _Confirmado, LOW._
- **Descripción:** `POST /products/import` parsea el CSV a mano y solo valida `name` no vacío y `salePrice` no-NaN, **sin** `@Min(0)`. Un precio `-5` pasa y se inserta con `createMany`, evitando la validación de `CreateProductDto`. Un producto con precio negativo genera líneas de venta con bruto negativo, descuadrando totales/caja/KPIs. Datos corruptos dentro del propio tenant.
- **Remediación:** En `importCsv` rechazar `price < 0` (y acotar precisión/máximo); idealmente construir un `CreateProductDto` por fila y validarlo con `validateSync` para no duplicar reglas.

### SEC-17 · [LOW] Swagger/OpenAPI expuesto incondicionalmente en producción

- **Ubicación:** `apps/api/src/main.ts:42-51`. CWE-1295. _Confirmado, LOW._
- **Descripción:** `SwaggerModule.setup('docs', ...)` se ejecuta siempre, sin guard de entorno ni auth. La UI y el JSON OpenAPI quedan accesibles en `/docs` y, vía proxy, en `/api/docs` y `/api/docs-json`, publicando toda la superficie de la API (rutas, métodos, DTOs, validaciones) a cualquiera. No rompe aislamiento ni auth (los endpoints siguen protegidos), pero facilita el reconocimiento.
- **Remediación:** `if (process.env.NODE_ENV !== 'production') { SwaggerModule.setup(...) }`, o protegerlo con auth básica/IP allowlist si se necesita en producción.

### SEC-18 · [LOW] `CORS_ORIGINS` sin definir cae a orígenes localhost (fail-open de config)

- **Ubicación:** `apps/api/src/config/security.ts:14-22`. CWE-942. _Confirmado, LOW._
- **Descripción:** Con `CORS_ORIGINS` ausente, `parseCorsOrigins` devuelve la allowlist fija `DEFAULT_DEV_ORIGINS` (localhost). **Correcto** en que nunca refleja el `Origin` ni devuelve `*`/`true`, por lo que el patrón clásico de robo de credenciales por reflexión **no existe aquí**. El impacto es bajo además porque los tokens viajan por `Authorization: Bearer` (no cookies → el navegador no adjunta credenciales automáticamente) y los frontends reales hablan con la API mismo-origen vía el proxy nginx. El riesgo es de hardening: una imagen de producción que acepta orígenes localhost.
- **Remediación:** En producción, fallar de forma segura: si `NODE_ENV==='production'` y `CORS_ORIGINS` no está definido, abortar el arranque (igual que con `JWT_SECRET`). Reservar `DEFAULT_DEV_ORIGINS` solo para no-producción. Documentar `CORS_ORIGINS` como obligatoria.

### SEC-19 · [LOW] Sin protección anti-fuerza-bruta específica para el PIN de autorización (devolución ciega)

- **Ubicación:** `apps/api/src/returns/returns.service.ts:182-199`. CWE-307. _Confirmado, LOW._
- **Descripción:** `resolveAuthorizer()` compara el `managerPin` (4-8 dígitos) contra los `pinHash` de todos los `MANAGER`/`ADMIN` activos del tenant. No hay lockout por intentos fallidos ni throttle específico — solo el global (120/60s). Un PIN de 4 dígitos (10 000 combinaciones, y un acierto vale contra **cualquier** autorizador del tenant) es fuerza-bruteable en horas. Requiere ya una sesión `CLERK` válida.
- **Remediación:** Contador de intentos fallidos con lockout temporal por usuario/tienda, `@Throttle` estricto en `/returns/blind`, mínimo de 6 dígitos, y alerta ante rachas de PIN inválidos.

### SEC-20 · [LOW] `accessToken` y `refreshToken` persistidos en `localStorage`

- **Ubicación:** `packages/auth/src/auth-store.ts:47-62`. CWE-522. _Confirmado, LOW._
- **Descripción:** El `persist` de zustand serializa ambos tokens en `localStorage`, accesible desde cualquier JS del mismo origen → un único XSS exfiltra ambos (el refresh permite renovar indefinidamente, ver SEC-06). **No es explotable hoy** (la auditoría no encontró ningún sink de XSS: sin `innerHTML`/`dangerouslySetInnerHTML`/`document.write`; el QR usa esquema fijo + `URLSearchParams`), pero es una debilidad de defensa en profundidad: si entra un XSS, el robo de sesión es trivial.
- **Remediación:** Emitir el refresh token como cookie `httpOnly+Secure+SameSite=strict` y dejar de persistirlo en `localStorage` (el accessToken de corta vida puede vivir en memoria). Si se mantiene `localStorage`, compensar con CSP estricta, rotación de refresh (SEC-06) y revocación server-side.

### SEC-21 · [LOW] Imagen Semgrep en CI sin pinnear por digest

- **Ubicación:** `.github/workflows/security.yml:52-53`. CWE-1357. _Confirmado, LOW._
- **Descripción:** El job `semgrep` corre en `returntocorp/semgrep:latest` (tag mutable, además nombre heredado/deprecado). Contradice la política del propio repo, que pinnea todas las Actions por SHA. Si la cuenta publicadora se compromete, una imagen maliciosa se ejecutaría con el checkout del repo. _Blast radius acotado:_ el job tiene `permissions: contents: read` y `persist-credentials: false`; el deploy con secrets corre en jobs separados.
- **Remediación:** Pinnear por digest inmutable (`semgrep/semgrep@sha256:<digest>`, migrando al nombre actual), o al menos una versión fija en lugar de `latest`.

### SEC-22 · [LOW] Fallos de escritura del audit log descartados silenciosamente

- **Ubicación:** `apps/api/src/audit/audit.interceptor.ts:40-52`. CWE-778. _Confirmado, LOW._
- **Descripción:** El `AuditInterceptor` registra cada mutación fire-and-forget en un `tap()` con `.catch(() => undefined)`. Si el INSERT en `AuditLog` falla, la mutación ya se confirmó y devolvió 200, pero no queda rastro ni warning ni métrica. Para un TPV con datos fiscales, la auditoría es un control de cumplimiento; perder registros en silencio degrada la trazabilidad. No es fuga ni rotura de aislamiento (el INSERT corre con el `organizationId` correcto), de ahí LOW.
- **Remediación:** `Logger.error` (+ métrica/alerta) cuando falle el create de `AuditLog`. Para acciones críticas (usuarios, roles, anulaciones) valorar auditoría síncrona dentro de la misma transacción.

### SEC-23 · [LOW] Eventos de autenticación no se auditan

- **Ubicación:** `apps/api/src/audit/audit.interceptor.ts:30-32`. CWE-778. _Confirmado, LOW._
- **Descripción:** El interceptor solo audita mutaciones con `req.user`. Como `/auth/login` y `/auth/refresh` son `@Public` (sin `req.user`), **ningún** intento de login (exitoso o fallido) queda registrado, ni hay `Logger` en `AuthService`/`AuthController`. No hay traza de accesos ni de fuerza bruta más allá del rate-limit en memoria.
- **Remediación:** Auditar/loguear eventos de autenticación: login exitoso (userId, organizationId, IP), login fallido (email + IP, **sin** password) y refresh. Persistir al menos los fallidos para detección de fuerza bruta. Nunca loguear password/tokens.

---

## Hallazgos en disputa (revisión humana recomendada)

Verificación adversarial dividida (1 de 2 lentes lo considera vulnerabilidad real). Ambos comparten la misma precondición: **requieren acceso de escritura directo a la base de datos** (rol `app`/`app_admin` o Postgres crudo), fuera del modelo de amenaza de la aplicación (no hay endpoint HTTP que los alcance). Se clasifican como **deuda de cumplimiento/integridad**, no como vulnerabilidad explotable vía la app. Relevantes de cara a la homologación VeriFactu real.

- **D1 · La cadena VeriFactu es solo un hash SHA-256 encadenado, sin firma ni clave secreta** (`verifactu.hash.ts:16-26`, CWE-345). `computeHash` es una función pura de datos públicos de la propia fila; quien tenga escritura en BD puede alterar el importe y **recalcular** el hash y toda la cadena posterior, dejándola internamente coherente. El hash detecta manipulación accidental pero no garantiza inalterabilidad frente a un actor con acceso a BD — justo lo que exige el Reglamento. El proveedor actual es **sandbox** (`verifactu.provider.ts`, no remite a la AEAT), por lo que la integridad regulatoria real (firma XAdES / remisión continua) aún no está cableada. **Acción:** al integrar el proveedor homologado, asegurar firma electrónica o HMAC con clave gestionada fuera de la BD (KMS/secret).
- **D2 · `VerifactuRecord` es mutable a nivel de BD (sin append-only)** (`migrations/...verifactu/migration.sql:7-43`, CWE-285). La tabla recibe `GRANT ALL` al rol `app` y no tiene trigger/regla que impida `UPDATE`/`DELETE` de los campos fiscales (`hash`, `previousHash`, `payload`, `type`). **Acción:** trigger `BEFORE UPDATE` que rechace cambios en columnas fiscales (permitiendo solo `status`/`attempts`/`lastError`/`sentAt`), `REVOKE DELETE ... FROM app`, e idealmente separar el estado de envío en otra tabla para que la fila fiscal sea estrictamente inmutable.

---

## Controles verificados correctos (cobertura)

Verificado manualmente además del barrido automático. Estos controles **están bien** y conviene preservarlos:

- **Aislamiento multi-tenant (RLS):** 23 de las 24 tablas tienen `ENABLE` + `FORCE ROW LEVEL SECURITY` y policy `USING (... = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)`. El `FORCE` impide que el owner escape; el `NULLIF` convierte el setting vacío en `NULL` → sin contexto, **0 filas (fail-safe)**. El `set_config` se inyecta **parametrizado** dentro de una transacción (`prisma.service.ts`, `with-tenant-tx.ts`). El rol `app` es `NOLOGIN` sin `BYPASSRLS`; el `BYPASSRLS` (`app_admin`) solo se usa en el lookup de login (antes de conocer el tenant). _Excepción:_ la tabla `UserStore` **no tiene RLS propia** (decisión documentada en la migración) — relacionado con SEC-01; conviene añadirle policy o, como mínimo, no depender solo del `WHERE` de aplicación.
- **No exposición de credenciales:** `users.service` usa `PUBLIC_SELECT` en todas las lecturas con un tipo `PublicUser` que garantiza en compilación que nunca se devuelven `passwordHash`/`pinHash`. `/auth/me` solo devuelve el payload del JWT.
- **SQL:** no hay `$queryRawUnsafe`/`$executeRawUnsafe`; todo el SQL crudo usa _tagged templates_ parametrizados. El único `Prisma.raw(column)` (`dashboard.service.ts:456`) recibe siempre **literales del código** en sus 13 call sites (verificado); el `storeId` va parametrizado. Sin inyección SQL.
- **Inyección de comandos / deserialización / XSS:** sin `child_process`/`eval`/`new Function`/`yaml.load`/`pickle`; sin `innerHTML`/`dangerouslySetInnerHTML`/`document.write` en los frontends.
- **Autenticación base:** secretos JWT **obligatorios** sin defaults (`requireSecret` aborta el arranque si faltan); login con `@Throttle(5/min)`; password hasheado con bcrypt; guards globales en orden correcto (throttler → auth → roles) con `@Public` explícito solo en login/refresh.
- **Dependencias:** `pnpm audit --prod` sin vulnerabilidades conocidas; Dependabot activo para npm y github-actions.
- **Contenedores/CI:** Dockerfiles de frontend usan imagen `nginx-unprivileged` con `USER nginx` (no root); las GitHub Actions están pinneadas por SHA; el job de Semgrep usa `contents: read` y `persist-credentials: false`.

---

## Recomendaciones priorizadas

1. **Cerrar el IDOR cross-store (SEC-01).** Es el hallazgo de mayor impacto explotable hoy. Implementar `assertStoreAccess(userId, role, storeId)` reutilizable y aplicarlo en todas las escrituras por tienda. _Impacto alto, esfuerzo medio._
2. **Garantizar el registro VeriFactu (SEC-02, SEC-07).** Mover el `recordFor` de venta a la transacción (o patrón `PENDING` + reconciliación) y añadir el registro `RECTIFICATION` en devoluciones. _Impacto alto (cumplimiento legal), esfuerzo medio._
3. **Limitar conexiones SSE concurrentes y multiplexar Redis (SEC-03).** Evita una caída de toda la API por agotamiento de Redis. _Impacto alto, esfuerzo bajo-medio._
4. **Decidir el estado de despliegue de los frontends (SEC-04, SEC-05).** Invertir el default de `isDemo()` a opt-in, declarar `VITE_DEMO_MODE` en el Dockerfile del TPV, y no exponer el backoffice (cascarón demo) en producción hasta cablearlo. Añadir smoke test de deploy. _Impacto alto (integridad de release), esfuerzo bajo._
5. **Endurecer el rate limiting y la sesión (SEC-08, SEC-06).** `trust proxy` + storage Redis del throttler; rotación/revocación de refresh tokens con `jti`. _Impacto medio-alto, esfuerzo medio._
6. **Acotar recursos por petición (SEC-09, SEC-10).** Paginación obligatoria con tope, `@ArrayMaxSize` y límite de body parser. _Impacto medio, esfuerzo bajo._
7. **Integridad contable y validación de entrada (SEC-11, SEC-12, SEC-15, SEC-16, SEC-19).** Reflejar reembolsos en el cuadre; clases DTO validadas para auth; `@Max`/`maxDecimalPlaces`; validar el import CSV; lockout del PIN. _Impacto medio-bajo, esfuerzo bajo._
8. **Reducir superficie y mejorar observabilidad (SEC-17, SEC-18, SEC-20…SEC-23).** Swagger fuera de producción; `CORS_ORIGINS` obligatoria en prod (fail-closed); refresh en cookie `httpOnly`; pinnear Semgrep; loguear/auditar fallos de audit y eventos de autenticación. _Impacto bajo, esfuerzo muy bajo._
9. **Cumplimiento VeriFactu (D1, D2).** Al cablear el proveedor homologado, añadir firma/sellado y hacer `VerifactuRecord` append-only a nivel de BD (trigger + `REVOKE DELETE`). _Impacto alto en cumplimiento, esfuerzo medio; planificar con el go-live fiscal._

---

_Informe generado mediante auditoría multi-agente (89 subagentes, verificación adversarial de 3 lentes) con verificación manual independiente de los hallazgos HIGH y los controles núcleo. Las severidades son orientativas; trátese como complemento —no sustituto— de revisión humana, SAST/DAST y pentesting._
