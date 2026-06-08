# Diseño — #137 Trazabilidad: devolución al lote original

> Estado: **BORRADOR para validar** (no tocar código hasta aprobar). Issue: ncara42/simpleTPV #137.
> Seguimiento de #126 (cerrada). Contexto/gotchas: `docs/superpowers/specs/2026-06-07-issue126-lote-caducidad-fefo-design.md` y `docs/roadmap-post-mvp.md`.

## 1. Objetivo

Que las **entradas de reposición** de un producto con lote (`tracksBatch=true`)
reingresen al **lote original** del que salió la mercancía, manteniendo el invariante
**`Stock.quantity == Σ StockBatch.quantity`** que el slice 3 (FEFO) garantizó en la salida.
Aplica a los tres flujos que hoy reponen stock: **devolución con ticket**, **anulación de
venta** y **devolución sin ticket** (ciega).

## 2. Estado actual (el hueco)

Tras #126, la **salida** de un producto con lote cuadra: `applyFefoOutflow` decrementa
`Stock` y los `StockBatch` consumidos a la vez, y graba el `batchId` en cada
`StockMovement` SALE (uno por lote; el faltante sin lote). Pero las **entradas de
reposición** siguen usando `applyMovement` **sin `batch`**:

- `returns.service.ts::create` (devolución con ticket) → RETURN sin lote.
- `returns.service.ts::createBlind` (devolución ciega) → RETURN sin lote.
- `sales.service.ts::void` (anulación) → RETURN sin lote.

Para un producto `tracksBatch`, eso **incrementa el `Stock` agregado pero ningún
`StockBatch`** → el invariante `Stock == Σ lotes` queda roto (Stock por encima de la
suma de sus lotes). Es un hueco **latente** (no hay test del cuadre tras devolución,
por eso el gate del slice 3 quedó verde). Los productos sin `tracksBatch` no se ven
afectados (no tienen lotes; flujo idéntico al actual).

### Datos disponibles para reconstruir el lote original

La venta dejó la traza exacta: `StockMovement` con `type='SALE'`, `referenceId=saleId`,
`productId`, `batchId` (uno por lote consumido por FEFO) y `quantity` negativa. La suma
de `|quantity|` con `batchId` no nulo = unidades vendidas **con lote**; un eventual
movimiento SALE **sin** `batchId` = faltante vendido sin lote. Esa es la fuente de verdad
de "qué unidad salió de qué lote".

## 3. Decisiones de diseño (con recomendación)

**D1 — Reingreso trazable por los movimientos de la venta (no por heurística).**
Para devolución con ticket y anulación, el reparto del reingreso se calcula leyendo los
`StockMovement` SALE de esa venta+producto (su `batchId` y cantidad), **no** adivinando.
→ _Recomendado_: determinista, auditable y, para una devolución total, **revierte
exactamente** la salida.

**D2 — Orden de reparto en devolución parcial: mismo orden de consumo (FEFO), capado por
lote.** Se reingresa por el orden en que se consumieron los lotes (orden de creación de
los movimientos SALE = orden FEFO, caducidad ascendente), **sin superar** por lote lo que
salió de él menos lo ya reingresado en devoluciones previas. Así nunca se devuelve a un
lote más de lo que de él salió y el cuadre se mantiene acotado por el histórico.
→ _Recomendado_. Alternativas descartadas: proporcional (introduce decimales/redondeos) y
LIFO (sin ventaja clara y menos intuitivo que espejar el consumo). **A confirmar (Q1).**

**D3 — Idempotencia frente a devoluciones parciales sucesivas.** Antes de repartir se
descuenta lo **ya reingresado por lote** en devoluciones anteriores de la misma
venta+producto (movimientos `type='RETURN'`, `referenceId` de devoluciones de esa venta,
con `batchId`). Evita reingresar dos veces al mismo lote al encadenar devoluciones
parciales. El lock `FOR UPDATE` sobre la venta (ya existente en `create`) serializa
concurrentes.

**D4 — Faltante sin lote → reingreso sin lote.** La parte vendida sin lote (movimiento
SALE sin `batchId`, p.ej. se vendió más de lo recibido) se reingresa **sin lote** (igual
que salió). No descuadra: ni salió ni entra a ningún `StockBatch`.

**D5 — Anulación de venta: revierte el 100%.** `void` reingresa cada lote exactamente por
lo que salió (espejo total de los movimientos SALE). Caso más simple de D1/D2 (Q=total,
sin parciales previos).

**D6 — Devolución ciega (sin ticket): sin lote original conocido.** No hay `saleId` →
no hay traza de lote. Opciones: **(a)** reingresar **sin lote** (Stock agregado sube, no
toca lotes → el invariante se desvía SOLO para devoluciones ciegas de productos con lote,
poco frecuentes y autorizadas por PIN; se documenta); **(b)** exigir que el autorizador
**elija el lote** (nuevo campo en el DTO ciego); **(c)** reingresar a un **lote sintético**
sin caducidad por producto (p.ej. `lotCode='SIN-LOTE'`). → _Recomendado **(a)**_ por YAGNI
y porque la ciega ya es un caso excepcional; revisitar si el cuadre estricto lo exige.
**A confirmar (Q2).**

**D7 — `applyMovement` ya soporta reingreso a lote.** El upsert de `StockBatch` por
`(producto, tienda, lotCode)` con `increment` positivo y `expiryDate` preservada (no se
pisa si no llega fecha) ya existe desde el slice 2. El reingreso pasa `batch: { lotCode }`
(sin `expiryDate`, para no tocar la caducidad del lote existente). No hace falta tocar el
chokepoint; la lógica de reparto vive en un método nuevo del `StockService`.

## 4. Forma propuesta

Nuevo método en `StockService` (núcleo, reutilizado por los tres flujos):

```ts
// Reingreso a lote(s) original(es) de una salida previa (#137). Lee los movimientos
// SALE de referenceId+producto, descuenta lo ya reingresado por lote, y reparte `qty`
// por orden de consumo capando por lote; el resto, sin lote. DEBE correr en withTenantTx.
applyBatchedReturn(tx, {
  organizationId, productId, storeId,
  originSaleId,        // venta de la que salió (para leer sus movimientos SALE)
  quantity,            // POSITIVO a reingresar
  referenceId,         // returnId | saleId (anulación) → traza del RETURN
  userId,
}, afterCommit): Promise<number>
```

- Productos **sin** `tracksBatch`: atajo directo a `applyMovement` (RETURN sin lote), sin
  consultar movimientos. Sin cambios de comportamiento.
- Dominio puro y testeable: `allocateReturnToBatches(consumed, alreadyReturned, qty)`
  → `{ perBatch: [{batchId, qty}], noLot }`, espejo de `allocateFefo`. Trabaja con
  `batchId` (identificador estable de los movimientos SALE); el servicio traduce a
  `lotCode` para reingresar vía `applyMovement(batch:{lotCode})`.

Los call sites (`returns.create`, `returns.createBlind`, `sales.void`) sustituyen el
`applyMovement(type:'RETURN')` por `applyBatchedReturn` (la ciega pasa `originSaleId=null`
→ cae a reingreso sin lote según D6).

## 5. Flujos

- **Devolución con ticket** (`RETURN +`): por cada línea, `applyBatchedReturn` con
  `originSaleId = sale.id`. Reparte la cantidad devuelta a los lotes que esa venta
  consumió, capado y descontando devoluciones previas (D2/D3). Faltante sin lote (D4).
- **Anulación** (`void`): por cada línea, `applyBatchedReturn` con Q=total de la línea →
  revierte el consumo completo (D5).
- **Devolución ciega**: `originSaleId=null` → reingreso sin lote (D6 opción a).
- **Productos sin `tracksBatch`**: RETURN sin lote, como hoy.

## 6. Plan de slices

1. **Dominio + servicio**: `allocateReturnToBatches` (puro) + `StockService.applyBatchedReturn`
   (lee movimientos SALE/RETURN, reparte, reingresa por lote). Unit del dominio + unit del
   servicio (mocks de tx). Sin tocar aún los call sites.
2. **Cableado de los flujos**: `returns.create`, `sales.void` (y `createBlind` según D6) usan
   `applyBatchedReturn`. Integración: **cuadre `Stock == Σ lotes`** tras venta→devolución
   total y parcial; reingreso al lote correcto; orden; idempotencia de parciales; ciega.

Cada slice: PR a `main`, gate verde (cobertura ≥ floor — añadir unit, no bajar suelo),
ambos forks sincronizados. Mismo flujo de entrega que #126.

## 7. Decisiones (validadas 2026-06-08)

- **Q1 — Reparto parcial:** ✅ **Espejo del consumo FEFO capado por lote** (D2). Reingreso
  por orden de consumo (caducidad asc), sin superar por lote lo que salió menos lo ya
  devuelto.
- **Q2 — Devolución ciega de producto con lote:** ✅ **Sin lote y se documenta** la
  desviación del cuadre (D6a). La ciega es excepcional (autorizada por PIN); revisitar si
  el cuadre estricto lo exige.
- **Q3 — Alcance:** ✅ **Incluir la anulación (`void`)** en #137 (D5): comparte
  `applyBatchedReturn` y es el caso más simple (revierte el 100%).
- **Q4 — Test de regresión del cuadre:** ✅ **Sí**: el slice 2 añade integración que afirma
  `Stock == Σ lotes` tras venta→devolución (total y parcial) y tras anulación.

## 8. Riesgos

- Toca tres flujos de reposición (devolución, anulación) que mueven dinero/stock →
  regresiones. Mitigación: `tracksBatch=false` deja el flujo intacto; el reparto se prueba
  en dominio puro y el cuadre en integración.
- Devoluciones parciales encadenadas: el descuento de "ya reingresado por lote" (D3) es la
  parte sutil; cubrir con test de varias devoluciones parciales de la misma venta.
- Lotes a `quantity=0` siguen existiendo (no se borran) → el reingreso los reactiva sin
  recrear; verificado por el upsert del slice 2.

```

```
