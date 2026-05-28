# Spec — Issue #14: Historial de ventas del día por tienda (backoffice)

| Campo      | Valor                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                          |
| Estado     | Aprobado para implementación                                                                        |
| Issue      | [#14](https://github.com/ncara42/simpleTPV/issues/14) — `area:api`, `area:backoffice`, `mvp:week-2` |
| Blocked by | #8 ✅                                                                                               |

## 1. Objetivo

Visibilidad de ventas desde la central: `GET /sales?storeId=&date=` paginado con totales, y página en el backoffice con tabla + filtros (tienda, fecha) y total del día.

## 2. API

`GET /sales` (`@Roles('ADMIN','MANAGER')` — visibilidad de central, no para CLERK; coherente con que /stores es ADMIN/MANAGER). Query params:

- `storeId?: string` (UUID) — filtra por tienda. Opcional (si falta, todas las del tenant).
- `date?: string` (YYYY-MM-DD) — filtra por día (createdAt en [date 00:00, date+1 00:00) en hora local del servidor; usar rango UTC del día).
- `page?: number` (default 1), `pageSize?: number` (default 20, máx 100).

Respuesta `SalesPage`:

```
items: SaleSummary[]   // { id, ticketNumber, createdAt, total, paymentMethod, status, storeId }
page, pageSize, totalItems
totals: { count, totalAmount }   // SOLO ventas COMPLETED (las VOIDED no cuentan en el importe)
```

Servicio `findSales({ storeId?, date?, page, pageSize })`:

- requireTenant; where por organizationId (RLS + explícito), storeId si viene, createdAt en rango del día si viene.
- `findMany` con skip/take y orderBy createdAt desc + `count` para totalItems.
- `totals`: aggregate \_sum.total y \_count sobre el mismo where PERO con `status=COMPLETED` (las anuladas se listan en items con su status, pero no suman en totalAmount). Documentar: items incluye VOIDED (para auditoría visual), totals solo COMPLETED.
- Función pura `dayRange(date)` → { gte, lt } testeable.

DTO de query con class-validator (`@IsOptional @IsUUID storeId`, `@IsOptional @Matches(/^\d{4}-\d{2}-\d{2}$/) date`, `@IsOptional @IsInt @Min(1) page/pageSize`). Usa `@Type(() => Number)` para los numéricos de query.

Nota de rutas: ya existe `GET /sales/:id/ticket`. Añadir `@Get()` para el listado no colisiona con `:id/ticket`.

## 3. Backoffice

- `lib/admin.ts` (o nuevo `lib/sales.ts`): `listSales({storeId, date, page})` → api.get('/sales', params). Tipos `SaleSummary`/`SalesPage` en `@simpletpv/auth`.
- Página `SalesHistoryPage.tsx`: selector de tienda (usa listStores ya existente del backoffice, que es ADMIN), input de fecha (default hoy), tabla de ventas (ticket, hora, importe, método, estado), fila de totales (nº tickets + importe del día), y paginación (anterior/siguiente). Las ventas VOIDED se muestran atenuadas/etiquetadas.
- Enlazar la página en la navegación del backoffice (mirar cómo se montan las páginas actuales: StoresPage, CatalogPage, etc.).

## 4. Tests

- Unit: `dayRange` (límites del día); el servicio (mockeado) con/sin filtros, paginación, y que totals excluye VOIDED. Tests unitarios para mantener cobertura sobre el floor del ratchet.
- Integración: crear varias ventas (distintas tiendas, fechas, una VOIDED); `findSales` filtra por tienda y día correctamente, pagina, y totals suma solo COMPLETED; aislamiento por tenant.
