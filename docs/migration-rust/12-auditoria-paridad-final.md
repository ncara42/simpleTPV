# Auditoría de paridad final NestJS → Rust (#156)

> Revisión adversarial dominio-por-dominio (auditor + verificador independiente por
> hallazgo) para el corte de Fase 6. Estado de partida: workspace verde, **246 tests**.
> Este documento consolida los hallazgos **confirmados como reales** y su estado.

## Cobertura de la auditoría

| Dominio                                                            | Auditado | Resultado                                                |
| ------------------------------------------------------------------ | -------- | -------------------------------------------------------- |
| session (auth/me/events)                                           | ✅       | 1 HIGH (rate-limit global)                               |
| catalog (products/families/promotions/branding)                    | ✅       | sin huecos reales confirmados                            |
| sales (+export)                                                    | ✅       | 2 HIGH + 1 MEDIUM + 2 test-gaps                          |
| returns (+verifactu rectificativo)                                 | ✅       | 1 test-gap (corregido)                                   |
| dashboard (+tpv)                                                   | ✅       | 1 MEDIUM test-rigor (corregido) + 3 LOW validación       |
| verifactu                                                          | ✅       | sin huecos reales confirmados                            |
| **stock**                                                          | ❌       | **pendiente** (rate-limit del proveedor cortó el agente) |
| **b2b**                                                            | ❌       | **pendiente**                                            |
| **cash** (cash-sessions/z-report)                                  | ❌       | **pendiente**                                            |
| **ops-transfers** (transfers/purchases)                            | ❌       | **pendiente**                                            |
| **ops-catalog** (suppliers/stores)                                 | ❌       | **pendiente**                                            |
| **admin** (users/time-clock/devices/api-keys/feature-flags/public) | ❌       | **pendiente**                                            |

**6 de 12 dominios quedan por auditar** (el límite de tasa del proveedor cortó los
agentes en ambas tandas). No reclamamos paridad sobre ellos; ya están muy cubiertos
por tests previos, pero deben pasar la misma auditoría antes del flip definitivo.

## Hallazgos confirmados y estado

### Corregidos en esta tanda

- **[sales · HIGH] `GET /sales` ignoraba `q` (búsqueda libre).** El `ListQuery` de
  Rust no declaraba `q`, así que `serde_urlencoded` lo descartaba y el listado
  devolvía TODAS las ventas del tenant (y los totales se calculaban sobre el conjunto
  entero). **Portado** `buildSalesFilter`: ILIKE sobre `ticketNumber`, nombre del
  vendedor (`User.name`) y nombre de línea (`SaleLine.name`), más `total` exacto si el
  término es numérico. Aplicado al listado Y a los agregados. Todo por `push_bind`
  (sin inyección). `crates/domain/src/sales/service.rs::push_sales_search`.
  Test: `crates/domain/tests/sales_totals.rs::filtro_q_y_family_id_acotan_listado_y_totales`.
- **[sales · HIGH] `GET /sales` ignoraba `familyId`.** Mismo origen. Portado como
  `EXISTS (SaleLine JOIN Product WHERE familyId = …)`. Mismo test.
- **[returns · test-gap] El test del rectificativo VeriFactu no aseveraba el abono.**
  Reforzado para verificar `payload.total` NEGATIVO (= −total de la devolución) e
  `invoiceNumber` = ticket de la venta original (paridad spec NestJS SEC-07).
  `crates/domain/tests/verifactu_rectification.rs`.
- **[dashboard · MEDIUM] 8/13 KPIs solo tenían aserción de presencia.** Reforzados a
  valor/orden: `product-rankings` (#1 con total 40 / units 4), `product-rotation`
  (units 4), `archetype-rotation` (grupo «Sin arquetipo», units 4), intradía
  acumulado (último bucket = total del día), `deltaPct = null` cuando ayer = 0, y un
  test nuevo de `stockout-kpis` con alertas reales (events/open/resolved/duración
  media/ventas perdidas). `crates/domain/tests/dashboard.rs`.

### Pendientes antes del flip (NO corregidos — requieren PR propio)

- **[session · HIGH] Falta el rate-limit global del API privado.** NestJS aplicaba un
  `ThrottlerGuard` global (≈120/min/IP) a TODA ruta autenticada. En Rust el
  `GovernorLayer` solo cubre `/auth/login` (5/min), `/auth/refresh` (10/min) y
  `/public/stock` (30/min); `/me`, `/sales`, `/stock`, `/users`, `/dashboard`, etc.
  quedan **sin límite**. Es un retroceso de defensa en profundidad (anti-scraping/
  fuerza bruta/enumeración) sobre datos autenticados.
  **Remediación**: añadir un `GovernorLayer` global (~120/min/IP) que envuelva el
  árbol de rutas en `crates/http/src/router.rs`, sin tocar los `route_layer` más
  estrictos; parametrizar por env (`THROTTLE_LIMIT`/`THROTTLE_TTL`). **Cuidado**: un
  limitador global keyed-by-IP puede volver flaky los tests HTTP (comparten IP de
  test) → aislar por IP/puerto por test o togglear en test. Por eso se difiere a un
  PR dedicado, no se mete a última hora. **Corrige** la afirmación de
  `10-corte-produccion.md` de que los «rate-limits son sólidos»: lo son en auth, no en
  el API privado.
- **[sales · MEDIUM] Export de ventas: filtros por body (NestJS) vs query-string
  (Rust).** `POST /sales/export` y `/sales/export/accounting` leen los filtros de la
  query en Rust; NestJS los lee del cuerpo. Divergencia de contrato. Restaurar lectura
  por body (`Json<ExportBody>`) en `crates/http/src/sales_export.rs`.

### Aceptados como divergencia consciente (documentados, sin cambio)

Diferencias de **estrictez de validación de frontera**, sin impacto funcional ni de
seguridad; un frontend legítimo nunca envía estas entradas. Se aceptan por paridad de
comportamiento observable y para no introducir cambios transversales arriesgados
durante el corte:

- **[dashboard · LOW] `product-rankings?limit` fuera de rango** se clampa a [1,50]
  (200) en vez de rechazarse (400). El clamp es más tolerante; no rompe ningún flujo.
- **[dashboard · LOW] Query params desconocidos** se ignoran (Rust) en vez de
  rechazarse (NestJS `forbidNonWhitelisted`). Endurecerlo exigiría
  `#[serde(deny_unknown_fields)]` en TODAS las structs de query (transversal, con
  riesgo de romper params que el frontend sí manda) → no se hace ahora.
- **[dashboard · LOW] Formato de `from`/`to`** solo se valida en `period=custom`
  (Rust) vs siempre (DTO NestJS). En periodos no-custom ambos backends ignoran esos
  campos; la única diferencia es 200 vs 400 ante basura inerte.

### Test-gaps menores (deuda de cobertura, no de comportamiento)

- **[sales · MEDIUM] Falta test del `void` rechazado cuando la venta tiene
  devoluciones.** La implementación lo rechaza (`BadRequest`), pero no hay test que lo
  fije. Añadir en `crates/domain/tests/sales_rls.rs`.
- **[sales · LOW] Falta test directo del rechazo SEC-01 de `create` para un CLERK sin
  acceso a la tienda.** El comportamiento existe; falta la aserción explícita.

## Divergencias confirmadas como NO reales (falsos positivos del auditor)

- Resolución de periodos del dashboard en UTC vs TZ del servidor: documentada como
  deuda MVP coherente en todo el sistema; en prod NestJS ya corre en UTC → sin
  divergencia observable.
- `create_blind` comprueba el feature flag antes del acceso por tienda: el 403 es
  indistinguible → sin canal lateral real.
- Mensajes de error neutros (NotFound/BadRequest/Forbidden): divergencia consciente y
  documentada, status codes idénticos.

## Conclusión

La migración es **sólida**: de los dominios auditados solo emergen 2 regresiones HIGH
de filtrado/rate-limit (una ya corregida —`q`/`familyId`—, la otra documentada como
blocker), afinados de rigor de tests (corregidos) y nits de validación de frontera
(aceptados). **No** se cierra #156 todavía: faltan (a) el rate-limit global, (b) la
paridad de contrato del export, y (c) auditar los 6 dominios restantes.
