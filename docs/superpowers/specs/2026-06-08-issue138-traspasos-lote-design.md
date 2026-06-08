# Diseño — #138 Trazabilidad: traspasos con lote/caducidad

> Estado: **BORRADOR para validar** (no tocar código hasta aprobar). Issue: ncara42/simpleTPV #138.
> Seguimiento de #126 (cerrada). Relacionado: #137 (devolución al lote). Sin cambios de esquema.

## 1. Objetivo

En un traspaso entre tiendas de un producto con lote (`tracksBatch`), el **lote +
caducidad viaja del origen al destino**: la salida del origen consume por **FEFO** (como
la venta) y la entrada en destino **recrea los mismos lotes** (mismo `lotCode` y
`expiryDate`). Mantiene el invariante `Stock == Σ StockBatch` en ambas tiendas. El slice 2
de #126 solo cubrió la recepción de **compras**; el traspaso quedó pendiente.

## 2. Estado actual (el hueco)

`TransfersService` mueve stock en dos transiciones, ambas con `applyMovement` **sin lote**:

- `send` (DRAFT→SENT): `TRANSFER_OUT` del origen por `-quantitySent`.
- `receive` (SENT→RECEIVED): `TRANSFER_IN` del destino por `+quantityReceived` (lo
  realmente recibido; puede diferir de lo enviado → discrepancia/merma).

Para un producto `tracksBatch`, esto descuadra el origen (baja el agregado sin tocar sus
lotes) y el destino (sube el agregado sin crear lote) → se pierde la trazabilidad del lote
en el traspaso. Productos sin `tracksBatch`: flujo idéntico al actual.

## 3. Decisiones de diseño (con recomendación)

**D1 — Salida del origen por FEFO.** En `send`, para `tracksBatch`, sustituir
`applyMovement(TRANSFER_OUT)` por `applyFefoOutflow` (consume los lotes del origen por
caducidad ascendente, un movimiento por lote con su `batchId`; faltante sin lote). Reusa el
núcleo de #126 slice 3. → _Recomendado_.

**D2 — El lote viaja vía los movimientos TRANSFER_OUT (no por esquema nuevo).** En
`receive`, se reconstruyen los lotes enviados leyendo los `StockMovement` TRANSFER*OUT del
traspaso (`referenceId = transferId`, `productId`, `batchId`) y uniéndolos a `StockBatch`
del origen para su `lotCode` + `expiryDate`. → \_Recomendado* (mismo patrón que #137 lee los
SALE; sin migración). Alternativa (snapshot de lotes en `TransferLine` al enviar) añade
columnas y duplica estado. **A confirmar (Q1).**

**D3 — Entrada en destino: recrea los mismos lotes (lotCode + expiryDate).** Por cada lote
enviado, `applyMovement(TRANSFER_IN, +qty, batch:{lotCode, expiryDate})` en la tienda
destino → upsert del `StockBatch` destino por `(producto, destStore, lotCode)` con la
**misma caducidad** del origen (el lote conserva su fecha al viajar). → _Recomendado_.

**D4 — Recepción con discrepancia (recibido ≠ enviado).** Si `quantityReceived` difiere de
lo enviado: repartir lo recibido sobre los lotes enviados por orden de caducidad, **capado**
por lo enviado de cada lote (reusa `allocateReturnToBatches` con `alreadyReturned={}`); el
**exceso** (recibido > enviado) entra **sin lote** (no atribuible a un lote enviado), igual
que el faltante FEFO. La merma (recibido < enviado) simplemente reingresa menos: el origen
ya descontó lo enviado, así que la merma se queda "en tránsito" (ni en origen ni en destino),
coherente con el comportamiento actual de discrepancia. → _Recomendado_. **A confirmar (Q2).**

**D5 — Sin idempotencia extra.** El traspaso se recibe una sola vez (transición
SENT→RECEIVED condicional). No hay recepciones parciales encadenadas como en #137, así que
`alreadyReturned` es siempre `{}`. → _Recomendado_.

**D6 — Reutilización de dominio.** No hace falta dominio nuevo: `allocateFefo` (salida) y
`allocateReturnToBatches` (reparto de la recepción sobre los lotes enviados) ya existen. La
lógica de leer/mapear vive en un método nuevo `StockService.applyTransferReceipt`.

## 4. Forma propuesta

```ts
// Entrada en destino de un traspaso (#138): recrea los lotes que salieron del origen
// (leídos de los movimientos TRANSFER_OUT del traspaso) en la tienda destino, con su
// misma caducidad. Reparte quantityReceived sobre los lotes enviados (capado, orden de
// caducidad); el exceso entra sin lote. DEBE correr en withTenantTx.
applyTransferReceipt(tx, {
  organizationId, productId, destStoreId,
  transferId,          // para leer los TRANSFER_OUT del origen
  quantityReceived,
  referenceId,         // = transferId (traza del TRANSFER_IN)
  userId,
}, afterCommit): Promise<number>
```

- `send`: para `tracksBatch` → `applyFefoOutflow(TRANSFER_OUT)`; si no, `applyMovement`.
- `receive`: para `tracksBatch` → `applyTransferReceipt`; si no, `applyMovement(TRANSFER_IN)`.
- Productos sin `tracksBatch`: flujo idéntico al actual.

## 5. Flujos

- **Envío** (`send`): FEFO del origen → N movimientos TRANSFER_OUT (uno por lote + faltante
  sin lote). El origen cuadra (`Stock == Σ lotes`).
- **Recepción** (`receive`): lee los TRANSFER_OUT del traspaso, mapea a `lotCode`+`expiryDate`,
  reparte lo recibido (capado por lo enviado de cada lote, orden de caducidad), y crea/incrementa
  los lotes en destino con su caducidad; exceso sin lote. El destino cuadra.

## 6. Plan de slices

Slice único (es pequeño y reusa dominio): `StockService.applyTransferReceipt` + cableado de
`send`/`receive` + unit (servicio: salida FEFO en envío; recepción recrea lotes con
caducidad; discrepancia merma/exceso) + integración real (cuadre `Stock == Σ lotes` en
origen y destino; el lote+caducidad llega al destino; merma/exceso). PR a `main`, gate verde,
forks sincronizados.

## 7. Decisiones (validadas 2026-06-08)

- **Q1 — Travel del lote:** ✅ **Leer los movimientos TRANSFER_OUT** del traspaso (D2). Sin
  cambios de esquema; mismo patrón que #137.
- **Q2 — Exceso en recepción (recibido > enviado):** ✅ **Sin lote** (D4): el sobrante no
  atribuible a un lote enviado entra sin lote, como el faltante FEFO.
- **Q3 — Caducidad en destino:** ✅ El lote **conserva su `expiryDate`** del origen al viajar
  (D3).
- **Q4 — Alcance:** ✅ **Slice único** (envío FEFO + recepción con lote en un PR); reusa el
  dominio existente.

## 8. Riesgos

- Toca `send`/`receive` (mueven stock entre tiendas) → regresiones. Mitigación:
  `tracksBatch=false` deja el flujo intacto; cobertura de integración del cuadre en ambas
  tiendas.
- Merma en tránsito: lo enviado y no recibido queda descontado del origen sin entrar en
  destino (comportamiento actual de discrepancia, no introducido por #138); se documenta.
