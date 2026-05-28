# Spec — Issue #28: Consultas de stock + cache Redis

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado                                                                     |
| Issue      | [#28](https://github.com/ncara42/simpleTPV/issues/28) — `area:api`, `mvp:week-3` |
| Blocked by | #27 (stock base, `applyMovement`)                                                |

## 1. Objetivo

Endpoints de consulta de stock (por tienda, global, por producto) aislados por tenant, con cache Redis que acelera las lecturas y degrada a Postgres si Redis no está. Estado semáforo verde/amarillo/rojo derivado de quantity vs minStock.

## 2. Endpoints

- `GET /stock?storeId=` — stock de todos los productos de una tienda (quantity, minStock, level).
- `GET /stock/global` — agregado por producto: stock en cada tienda + total del tenant. Para el backoffice.
- `GET /stock/product/:productId` — stock de un producto en todas las tiendas.

Todos: `@Roles(ADMIN, MANAGER, CLERK)` (el TPV consulta stock al vender). RLS + `organizationId` explícito (defensa en profundidad).

## 3. Estado semáforo

`stockLevel(quantity, minStock)` — función pura:

- `red` si `quantity <= 0` (sin stock).
- `yellow` si `0 < quantity <= minStock` (en/bajo el mínimo).
- `green` si `quantity > minStock`.

## 4. Cache

Abstracción `Cache` (get/set/del de string) que **nunca lanza**: ante fallo del backend, get→null y set/del no-op, para que el llamante degrade a Postgres.

- `RedisCache` (ioredis): cliente con `maxRetriesPerRequest: 1` y retry acotado; la offline queue (default) encola los comandos hasta que la conexión esté lista. Listener `error` para no tumbar el proceso. Loguea un warning (con dedupe) al degradar.
- `MemoryCache` (Map): para tests/CI sin Redis y como fallback si no hay `REDIS_URL`.
- `CacheModule` global elige `RedisCache` si hay `REDIS_URL`, si no `MemoryCache`.

Clave: `stock:{org}:{store}:{product}` → quantity. `applyMovement` (#27) escribe la quantity resultante tras cada movimiento. `byProduct` lee del cache por par producto+tienda y, en miss (o cache caído → null), usa la quantity de Postgres y repuebla. `byStore`/`global` leen de Postgres (necesitan minStock/nombre que el cache puntual no guarda).

**Postgres es la fuente de verdad**; el cache es solo optimización de lectura.

## 5. Infra

- `docker-compose.yml`: servicio `redis:7-alpine`, host `:6381` (evita colisión con 6379).
- `REDIS_URL` en `.env`/`.env.example`. En producción Dokploy provee `dokploy-redis`.

## 6. Tests

- Unit: `stockLevel`; `byStore`/`global`/`byProduct` con prisma mockeado; cache hit/miss/corrupto; controller delega; `RedisCache` feliz y degradación (cliente que lanza); `MemoryCache`.
- Integración: `byStore`/`global`/`byProduct` contra Postgres; cache hit sirve del cache y miss repuebla; aislamiento por tenant. Verificación manual de Redis real (SET/GET/DEL) y degradación con Redis caído.
