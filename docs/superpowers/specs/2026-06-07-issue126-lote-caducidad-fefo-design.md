# Diseño — #126 Trazabilidad: lote + caducidad (FEFO)

> Estado: **BORRADOR para validar** (no tocar BD hasta aprobar). Issue: ncara42/simpleTPV #126.
> Contexto y gotchas: `docs/roadmap-post-mvp.md` §3 (migraciones a mano, RLS, ratchet).

## 1. Objetivo

Soportar **lote** (nº de lote del proveedor) y **fecha de caducidad** en el stock, con
consumo **FEFO** (first-expired-first-out) en la venta y **alertas de caducidad próxima**.
Relevante para CBD/consumibles (posible requisito regulatorio de trazabilidad).

## 2. Estado actual (lo que hay)

- `Stock` = agregado **(producto, tienda) → quantity** (`@@unique([productId, storeId])`).
- `StockMovement` = log de auditoría (entrada/salida, `referenceId` al documento origen).
- **`StockService.applyMovement(tx, input)` es el ÚNICO chokepoint** de cambios de stock:
  upsert de `Stock` + crea `StockMovement` + reevalúa alerta, todo dentro de un
  `withTenantTx`. Lo invocan venta (SALE −), devolución (RETURN +), traspaso
  (TRANSFER_IN/OUT), recepción de compra (PURCHASE_RECEIPT +) y ajuste (ADJUSTMENT).
- `StockAlert` (LOW_STOCK / OUT_OF_STOCK) es **event-driven**: se dispara/resuelve dentro
  del flujo del movimiento (no hay cron). `AlertType` enum.
- `MovementType`: SALE, RETURN, TRANSFER_IN, TRANSFER_OUT, PURCHASE_RECEIPT, ADJUSTMENT.
- La venta **nunca se bloquea** por falta de stock (puede quedar negativo); el control es
  por alertas, no por bloqueo (decisión semana 3).

## 3. Decisiones de diseño (con recomendación)

**D1 — Modelo: `StockBatch` (capa granular) bajo `Stock` (agregado).**
Nuevo modelo `StockBatch` = **(producto, tienda, lote, caducidad) → quantity**. `Stock.quantity`
se mantiene como **agregado** (Σ de sus lotes) para no romper las vistas/alertas/cache
existentes ni los productos sin lote. Los lotes son el detalle para FEFO y caducidad.
→ _Recomendado_ (mínimo blast radius; lo alternativo —campos en Stock— no permite varios
lotes por par producto/tienda).

**D2 — Opt-in por producto: `Product.tracksBatch Boolean @default(false)`.**
Solo los productos marcados exigen lote+caducidad en recepción y usan FEFO en venta. El
resto sigue el flujo actual **sin cambios de comportamiento**. → _Recomendado_ (responde a
"¿lote obligatorio u opcional?": opt-in por producto; CBD/consumibles lo activan).

**D3 — Trazabilidad del movimiento: `StockMovement.batchId String? @db.Uuid`.**
Cada salida/entrada de un producto con lote referencia el `StockBatch` afectado → trazas
"qué lote se vendió en qué ticket" (regulatorio CBD). Un movimiento FEFO que cruza N lotes
genera **N movimientos** (uno por lote), manteniendo el log atómico y trazable.

**D4 — FEFO en la salida + filosofía no-bloqueante.**
En venta/salida de un producto con lote: consumir lotes por **caducidad ascendente**
(más próxima primero); si un lote no cubre, pasar al siguiente. Si el total de lotes no
cubre la cantidad (vender más de lo recibido): consumir todo lo disponible por FEFO y el
**faltante** como movimiento sin lote (Stock agregado puede quedar negativo, igual que hoy).
→ _Recomendado_ mantener no-bloqueante (coherente con el sistema actual). **A confirmar (Q3).**

**D5 — Caducidad: alerta computada on-read (sin cron).**
La caducidad es **time-driven** (un lote "caduca" por el paso del tiempo, sin movimiento),
mientras `StockAlert` es event-driven → no encajan directamente. Propuesta: una **query
`expiringBatches(thresholdDays)`** que devuelve lotes caducados / por caducar, surfaced en
la vista de **Notificaciones** del backoffice (junto a las alertas de stock). Sin cron ni
tabla nueva de alertas persistidas. → _Recomendado_. Alternativa (persistir en StockAlert +
barrido programado) queda para más adelante. **A confirmar (Q2).**

**D6 — Umbral de "por caducar": constante con default sensato (p.ej. 30 días).**
Configurable por org más adelante (YAGNI ahora). **A confirmar (Q5).**

## 4. Modelo de datos propuesto

```prisma
model StockBatch {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @db.Uuid
  productId      String    @db.Uuid
  storeId        String    @db.Uuid
  lotCode        String                      // nº de lote del proveedor (texto libre)
  expiryDate     DateTime? @db.Date          // caducidad (nullable: lote sin caducidad)
  quantity       Decimal   @default(0) @db.Decimal(12, 3)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  product      Product      @relation(fields: [productId], references: [id])
  store        Store        @relation(fields: [storeId], references: [id])

  @@unique([productId, storeId, lotCode])     // un lote por par producto/tienda
  @@index([organizationId, storeId, expiryDate]) // FEFO + barrido de caducidad
}

// Product: + tracksBatch Boolean @default(false)
// StockMovement: + batchId String? @db.Uuid (+ relación opcional a StockBatch)
```

RLS: `StockBatch` lleva bloque RLS por `organizationId` (igual que el resto de tablas tenant),
escrito a mano en la migración (gotcha §3.2).

## 5. Flujos

- **Recepción** (compra `PURCHASE_RECEIPT`, traspaso `TRANSFER_IN`, ajuste/entrada manual):
  si `product.tracksBatch`, el documento aporta **lote + caducidad** → upsert de `StockBatch`
  (incrementa) + `applyMovement` (incrementa `Stock` agregado, movimiento con `batchId`).
- **Venta** (`SALE −`) y **traspaso salida** (`TRANSFER_OUT`): si `tracksBatch`, **FEFO**:
  recorrer lotes con `quantity > 0` ordenados por `expiryDate ASC` (NULLs al final),
  consumir de cada uno hasta cubrir; un movimiento por lote consumido. Faltante → D4.
- **Devolución** (`RETURN +`): reingresa al lote original si el movimiento de venta lo
  registró (`batchId`); si no, a un lote genérico/sin lote. **A confirmar (Q4 bis)**.
- **Productos sin `tracksBatch`**: flujo idéntico al actual (sin tocar `StockBatch`).

`applyMovement` gana conciencia de lote: nueva firma con `batchId?`/`lotCode?`/`expiryDate?`
opcionales; la lógica FEFO (multi-lote) vive en un método nuevo `applyBatchedOutflow` que
itera y llama a `applyMovement` por lote, todo en la MISMA tx.

## 6. Plan de slices (entrega como los bloques anteriores)

1. **Esquema + migración a mano + RLS** (`StockBatch`, `Product.tracksBatch`,
   `StockMovement.batchId`) + `prisma generate`. Tests: integración RLS del lote.
2. **Recepción con lote/caducidad**: compras/traspasos/entrada manual escriben lotes. Unit
   - integration.
3. **FEFO en salida** (venta + traspaso salida) + devolución al lote. El núcleo. Unit
   (dominio FEFO puro) + integration (cuadre Stock = Σ lotes; orden de consumo).
4. **Caducidad**: query `expiringBatches` + surfacing en Notificaciones (backoffice) y, si
   procede, selección de lote en recepción del TPV. Unit + integration.

Cada slice: PR a `main` con gate verde, ambos forks sincronizados.

## 7. Decisiones (validadas 2026-06-07)

- **Q1 — Alcance:** ✅ **Opt-in por producto** (`Product.tracksBatch`). El resto sin cambios.
- **Q2 — Caducidad:** ✅ **Computada on-read** (query `expiringBatches` en Notificaciones).
  Sin cron ni alertas persistidas.
- **Q3 — Faltante FEFO:** ✅ **No bloquear**: consumir lotes por FEFO y el faltante como
  movimiento sin lote (stock agregado puede quedar negativo, como hoy).
- **Q4 — Lote/devolución:** lote = **texto libre del proveedor**; la devolución reingresa al
  **lote original** (vía `batchId` del movimiento de venta) si existe; si no, sin lote.
- **Q5 — Umbral "por caducar":** **30 días** (constante; configurable por org más adelante).
- **Q6 — Trazabilidad:** ✅ **Sí**, `StockMovement.batchId` (lote → movimiento → ticket vía
  `referenceId`). `SaleLine.batchId` solo si hace falta en una iteración posterior.

## 8. Riesgos

- Mayor que el bloque fiscal: toca **modelo de datos** y el chokepoint `applyMovement`
  (usado por venta/compra/traspaso/devolución/ajuste) → regresiones potenciales en todo el
  stock. Mitigación: `tracksBatch=false` por defecto deja el flujo actual intacto; cobertura
  de integración del cuadre `Stock.quantity == Σ StockBatch.quantity`.
- Migración a mano (no `migrate dev`): replicar estilo + bloque RLS; aplicar con
  `migrate deploy` y `prisma generate` (gotcha §3.2).
