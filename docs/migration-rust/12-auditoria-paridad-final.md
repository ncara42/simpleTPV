# Auditoría de paridad final NestJS → Rust (#156)

> Revisión adversarial dominio-por-dominio (auditor + verificador independiente por
> hallazgo) para el corte de Fase 6. Base: workspace verde. Este documento consolida
> los hallazgos **confirmados como reales** y su estado tras las correcciones.

## Cobertura

**11 de 12 dominios auditados.** Solo queda **b2b** (su agente cayó por una conexión
cerrada a media respuesta; reintentar). Dominios cubiertos: session, catalog, sales,
returns, dashboard, verifactu, stock, cash, ops-transfers (transfers/purchases),
ops-catalog (suppliers/stores), admin (users/time-clock/devices/api-keys/
feature-flags/public).

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

- **Auditar el dominio b2b** (único sin cubrir): customers, price-lists,
  wholesale-orders, store-orders. Sospecha previa: test de rechazo de tarifa
  cross-tenant (RLS oculta items de otra org → cae a PVP).

## Falsos positivos confirmados (no reales)

- Periodos del dashboard en UTC vs TZ del servidor: deuda MVP documentada y coherente;
  en prod NestJS ya corre en UTC.
- `create_blind` comprueba el flag antes del store-access: 403 indistinguible.
- Mensajes de error neutros (NotFound/BadRequest/Forbidden): divergencia consciente
  documentada, status codes idénticos.

## Conclusión

La migración es **sólida**. De 11 dominios auditados emergieron 2 regresiones HIGH de
filtrado/rate-limit y 1 MEDIUM de seguridad (DoS) — **las tres corregidas** — más
deuda de tests y nits de validación de frontera, documentados arriba. **No se cierra
#156**: falta auditar b2b, completar la deuda de tests de seguridad (SEC-01/BOLA/
inventory-count) y decidir las divergencias de validación. El corte en vivo sigue
siendo una operación manual autorizada.
