# Auditoría de paridad final NestJS → Rust (#156)

> Revisión adversarial dominio-por-dominio (auditor + verificador independiente por
> hallazgo) para el corte de Fase 6. Base: workspace verde. Este documento consolida
> los hallazgos **confirmados como reales** y su estado tras las correcciones.

## Cobertura

**12 de 12 dominios auditados.** session, catalog, sales, returns, dashboard,
verifactu, stock, cash, ops-transfers (transfers/purchases), ops-catalog (suppliers/
stores), admin (users/time-clock/devices/api-keys/feature-flags/public) y **b2b**
(customers/price-lists/wholesale-orders/store-orders). El finder de b2b sí corrió,
pero **la verificación adversarial de b2b quedó parcial** (varios verificadores
cayeron por límite de sesión) → sus hallazgos están **sin confirmar** y deben
re-verificarse.

## Corregido en esta tanda (commits en `feat/rust-fase4-plataforma`, sin push a main)

- **[sales · HIGH] `GET /sales` ignoraba `q` y `familyId`** → devolvía TODAS las
  ventas + totales sobre el conjunto entero. Portado `buildSalesFilter` (ILIKE
  ticket/vendedor/línea + total numérico; `familyId` por EXISTS) en listado y
  agregados, con `push_bind`. Test `filtro_q_y_family_id_*`.
- **[session · HIGH] Faltaba el rate-limit GLOBAL del API privado.** NestJS limitaba
  TODA ruta autenticada (~120/min/IP). Añadido `GovernorLayer` global (env
  `THROTTLE_LIMIT`, def 120/min/IP) con extractor de clave **con fallback** (no 500
  cuando no hay IP: healthcheck del contenedor / oneshot de test). Test
  `private_api_has_global_rate_limit`.
- **[admin · MEDIUM/seguridad] `POST /users/import` perdía el límite estricto 2/min/IP
  (DOS-03).** Hashea hasta 500 bcrypt/petición. Añadido `route_layer` 2/min/IP
  (paridad `@Throttle`). Test `users_import_is_rate_limited_2_per_min`.
- **[sales · MEDIUM] Export de ventas por query en vez de body.** `POST /sales/export`
  y `/accounting` ahora leen los filtros del cuerpo JSON (paridad `@Body`). Test
  `export_valida_filtros_del_cuerpo`.
- **[dashboard · MEDIUM] 8/13 KPIs solo con aserción de presencia** → reforzados a
  valor/orden + test real de `stockout-kpis`.
- **[returns · test] Rectificativo VeriFactu** → asevera abono negativo + invoiceNumber.

Gate verde tras los cambios: **250 tests**, clippy/fmt limpios.

## Pendiente — deuda de tests (comportamiento correcto, sin cobertura)

No son defectos vivos: la implementación es correcta, falta la red de seguridad que
sí tenía el spec NestJS. Una regresión futura pasaría el gate.

- **[ops-transfers · HIGH] SEC-01 en recepción de traspaso**: que un CLERK no asignado
  a la tienda destino reciba 403 no está ejercitado en Rust (el guard existe). Añadir
  test en `crates/domain/tests/transfers.rs`.
- **[stock · MEDIUM] `POST /stock/inventory-count`**: cero tests. El spec NestJS
  aseveraba tx ÚNICA para N líneas (atomicidad, S-11) + delta por par (counted−actual).
  Añadir test de recuento multi-línea + rollback al fallar la línea k.
- **[admin · MEDIUM] BOLA en `pair` de dispositivos**: sin test de que un CLERK no
  empareje un dispositivo de tienda ajena.
- **[admin · MEDIUM] Recorte a 90 días** del historial de time-clock (DOS-02/04) sin
  test.
- **[admin · MEDIUM] SEC-01** en feature-flags de tienda y en history/entries de
  time-clock: denegación store-access sin test.
- **[cash · LOW] TOCTOU**: orden del lock pesimista (set_config→lock→read) y bloqueo de
  `approve` contra sesión CLOSED sin test (la lógica existe).
- **[ops-catalog · LOW] SEC-01**: la rama Forbidden (CLERK sin asignación → 403) y el
  default `isCentral=true` de `setCentral` sin test.
- **[stock · LOW] Rotación 'alta'/'media'** en `GET /stock/global` solo probada como
  función pura, no end-to-end (el SQL que agrega ventas COMPLETED en 30d).

## Pendiente — divergencias de CONTRATO de respuesta (bloquean el corte)

Forma del JSON que recibe el frontend. Durante el strangler la ruta la sirve Rust,
así que una forma distinta **rompe la UI**. Hay que alinearlas ANTES del flip:

- **[cash · HIGH] `GET /cash-sessions/movements/pending`**: Rust devuelve campos
  PLANOS (`storeName`, `requestedByName`); NestJS los anida (`store: { name }`,
  `requestedBy: { name }`). Documentado en el doc-comment del modelo como "divergencia
  menor" pero NO resuelto. Si la UI de aprobación de caja (#146) lee `.store.name`,
  se rompe. Fix: structs anidados en `crates/domain/src/cash_sessions/model.rs` con
  `#[serde(rename)]`, mapeando desde los campos planos del query.
- **[ops-transfers · MEDIUM] `GET /purchase-orders` y `/purchase-orders/:id`**: Rust
  no incluye el objeto `supplier` embebido que NestJS sí devuelve. Verificar qué lee
  la UI de compras antes de enrutar a Rust.
- **[b2b · MEDIUM, sin verificar] `GET /price-lists/:id`, `GET /wholesale-orders/:id`,
  `PATCH /customers/:id` inexistentes → 404 (Rust) vs 200/null (NestJS)**. Es la MISMA
  clase que la divergencia consciente ya documentada de `PATCH /price-lists/:id`
  (404 REST-correcto, decidido en #165): probablemente coherente e intencional, pero
  conviene **confirmar que la UI no depende del 200/null** y, si es consciente,
  añadirla a la lista de divergencias del HANDOFF.

## Pendiente — status codes 200 vs 201 (POST que crean recurso)

Varios `POST` que crean fila devuelven **200** en Rust donde NestJS devuelve **201**
(default de `@Post` sin `@HttpCode`): `/users/import`, `/time-clock`, `/devices/pair`,
`/cash-sessions/open`, `/cash-sessions/:id/movements`. Impacto bajo (un cliente que
valide `res.ok`/2xx no se rompe), pero divergencia de contrato real y fácil de
alinear (devolver `(StatusCode::CREATED, Json(..))`). `users::create`/`devices::create`/
`api_keys::generate` ya devuelven 201 correctamente → la omisión es accidental.

## Pendiente — divergencias de comportamiento (decidir: fix o aceptar)

- **[cash · MEDIUM] Escala decimal**: Rust no valida `maxDecimalPlaces:2` en importes
  de caja (NestJS sí). Impacto bajo (un importe con 3 decimales se guardaría) pero es
  validación de frontera ausente. Recomendado: validar la escala en el input de caja.
- **[ops-transfers · LOW] Tope de líneas**: Rust rechaza 201–500 líneas que NestJS
  acepta. Falta validación de `lotCode` (longitud/no-vacío) en recepción de compras.
- **[admin · LOW]** Orden flag-vs-store-access en `POST /time-clock` (403
  indistinguible); longitud de password en bytes (Rust) vs unidades UTF-16 (NestJS).
- **[cash · LOW]** Longitud de `reason` validada post-trim (Rust) vs pre-trim (NestJS).
- **[ops-catalog · LOW]** Orden de la comparativa de proveedores (bytes vs
  `localeCompare`); `PATCH` no limpia a NULL un opcional con `null` explícito (COALESCE
  vs Prisma).

Todas son de **estrictez de validación / orden**, sin impacto funcional ni de
seguridad material; aceptables por paridad de comportamiento observable durante el
corte. Se documentan aquí para decidirlas conscientemente, no dejarlas silenciosas.

## Pendiente — operativo

- **Re-verificar los hallazgos de b2b** (el finder corrió, pero la verificación
  adversarial quedó a medias por límite de sesión). Incluye el test pendiente de
  **fallback de tarifa cross-tenant** (RLS oculta items de otra org → cae a PVP),
  más los nits de b2b (trim de `name`, nombre solo-espacios 400-vs-201, clamp de
  `page`) y los 404-vs-200 listados arriba.
- **expiryDate en recepción de compras** (`/purchase-orders/:id/receive`): Rust solo
  valida el formato `YYYY-MM-DD` dentro de la rama de lote; NestJS siempre (DTO). LOW,
  fix trivial junto a la validación de `lotCode`.

## Falsos positivos confirmados (no reales)

- Periodos del dashboard en UTC vs TZ del servidor: deuda MVP documentada y coherente;
  en prod NestJS ya corre en UTC.
- `create_blind` comprueba el flag antes del store-access: 403 indistinguible.
- Mensajes de error neutros (NotFound/BadRequest/Forbidden): divergencia consciente
  documentada, status codes idénticos.

## Conclusión

La migración es **sólida**. De los 12 dominios auditados se corrigieron 2 regresiones
HIGH de filtrado/rate-limit y 1 MEDIUM de seguridad (DoS). Lo que queda para el corte,
por orden de prioridad:

1. **Contrato de respuesta (bloquean el flip)**: forma plana-vs-anidada de
   `/cash-sessions/movements/pending` (HIGH) y `supplier` embebido en
   `/purchase-orders` (MEDIUM) — rompen la UI si se enruta a Rust sin alinear.
2. **Deuda de tests de seguridad**: SEC-01 (recepción de traspaso, cash, ops-catalog),
   BOLA en pair de devices, `inventory-count` (S-11), 90d time-clock.
3. **Re-verificar b2b** (verificación incompleta) + el test de tarifa cross-tenant.
4. **Status codes 201** y **nits de validación de frontera** (decidir fix/aceptar).

**No se cierra #156.** El corte en vivo sigue siendo una operación manual autorizada.
