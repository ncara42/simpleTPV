/**
 * Dominio puro de stock: tipos, constantes y funciones SIN efectos (no tocan la
 * base de datos, la cache ni el contexto de tenant). Derivan el nivel semáforo y
 * el tipo de alerta a partir de `quantity`/`minStock`, separados de la
 * orquestación de `StockService` para poder probarlos de forma aislada.
 */
import type { AlertType } from '@simpletpv/db';

// Clave de cache del stock de un par producto+tienda dentro de un tenant.
export function stockCacheKey(organizationId: string, storeId: string, productId: string): string {
  return `stock:${organizationId}:${storeId}:${productId}`;
}

// Nivel de stock tipo semáforo, derivado de quantity vs minStock:
//   - red:    sin stock (quantity <= 0).
//   - yellow: en/por debajo del mínimo (0 < quantity <= minStock).
//   - green:  por encima del mínimo (quantity > minStock).
// Función pura, testeable. minStock 0 → solo red (<=0) o green (>0).
export type StockLevel = 'red' | 'yellow' | 'green';

export function stockLevel(quantity: number, minStock: number): StockLevel {
  if (quantity <= 0) {
    return 'red';
  }
  if (quantity <= minStock) {
    return 'yellow';
  }
  return 'green';
}

// Tipo de alerta que CORRESPONDE a un nivel de stock, o null si no hay alerta:
//   - OUT_OF_STOCK si quantity <= 0 (agotado).
//   - LOW_STOCK    si 0 < quantity <= minStock (bajo mínimo).
//   - null         si quantity > minStock (sin alerta).
// Función pura, testeable. Espeja stockLevel: red→OUT_OF_STOCK, yellow→LOW_STOCK.
export function alertTypeFor(quantity: number, minStock: number): AlertType | null {
  if (quantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (quantity <= minStock) {
    return 'LOW_STOCK';
  }
  return null;
}

// Orden de urgencia para listar alertas: OUT_OF_STOCK antes que LOW_STOCK.
export const ALERT_URGENCY: Record<AlertType, number> = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 1,
};

// Redondeo a 3 decimales (la cantidad de stock es Decimal(12,3)).
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface FefoBatch {
  lotCode: string;
  quantity: number;
}

export interface FefoAllocation {
  // Cuánto consumir de cada lote, en el orden FEFO de entrada (qty > 0).
  consumed: Array<{ lotCode: string; qty: number }>;
  // Cantidad que los lotes NO cubren (vender más de lo recibido): el caller la
  // aplica como salida SIN lote — no bloquea (decisión Q3). 0 si los lotes cubren.
  shortfall: number;
}

/**
 * Reparto FEFO (first-expired-first-out, #126) de una salida de `qty` unidades
 * sobre `batches` YA ORDENADOS por caducidad ascendente (el caller los lee así, con
 * NULLs al final). Consume de cada lote hasta cubrir la cantidad; si los lotes no
 * llegan, devuelve el faltante en `shortfall`. Función pura. `qty` se asume > 0.
 */
export function allocateFefo(batches: FefoBatch[], qty: number): FefoAllocation {
  let remaining = round3(qty);
  const consumed: Array<{ lotCode: string; qty: number }> = [];
  for (const b of batches) {
    if (remaining <= 0) {
      break;
    }
    if (b.quantity <= 0) {
      continue;
    }
    const take = round3(Math.min(remaining, b.quantity));
    consumed.push({ lotCode: b.lotCode, qty: take });
    remaining = round3(remaining - take);
  }
  return { consumed, shortfall: remaining > 0 ? remaining : 0 };
}

// Lote del que salió una venta, con lo consumido de él (qty > 0). En orden de
// consumo (FEFO: caducidad ascendente, = orden de los movimientos SALE).
export interface ConsumedBatch {
  batchId: string;
  qty: number;
}

export interface ReturnAllocation {
  // Cuánto reingresar a cada lote, en el orden de consumo (qty > 0).
  perBatch: Array<{ batchId: string; qty: number }>;
  // Cantidad que NO se atribuye a ningún lote (la venta tuvo faltante sin lote, o
  // los lotes ya recibieron todo lo que salió de ellos): se reingresa SIN lote.
  noLot: number;
}

/**
 * Reparto del reingreso de una devolución (#137) sobre los lotes que la venta
 * consumió. Espejo de allocateFefo: recorre `consumed` (lotes de la venta en orden
 * de consumo) y reingresa hasta `qty`, **capando** cada lote por lo que salió de él
 * menos lo ya reingresado en devoluciones previas (`alreadyReturned[batchId]`), para
 * no devolver a un lote más de lo que de él salió. Lo que exceda la capacidad de los
 * lotes (faltante vendido sin lote) cae en `noLot`. Función pura. `qty` se asume > 0.
 */
export function allocateReturnToBatches(
  consumed: ConsumedBatch[],
  alreadyReturned: Record<string, number>,
  qty: number,
): ReturnAllocation {
  let remaining = round3(qty);
  const perBatch: Array<{ batchId: string; qty: number }> = [];
  for (const c of consumed) {
    if (remaining <= 0) {
      break;
    }
    const already = alreadyReturned[c.batchId] ?? 0;
    const capacity = round3(c.qty - already);
    if (capacity <= 0) {
      continue;
    }
    const take = round3(Math.min(remaining, capacity));
    perBatch.push({ batchId: c.batchId, qty: take });
    remaining = round3(remaining - take);
  }
  return { perBatch, noLot: remaining > 0 ? remaining : 0 };
}

// Caducidad (#126 slice 4) — alerta de caducidad computada on-read (sin cron).

// Ventana por defecto de "por caducar": un lote que caduca dentro de estos días se
// considera próximo a caducar. Constante (configurable por org más adelante, Q5).
export const EXPIRY_THRESHOLD_DAYS = 30;

const MS_PER_DAY = 86_400_000;

// Estado de caducidad de un lote relativo a hoy:
//   - expired:  ya caducó (la fecha quedó atrás).
//   - expiring: caduca hoy o dentro de la ventana (0 <= días <= withinDays).
//   - ok:       caduca más allá de la ventana (no requiere atención).
export type ExpiryStatus = 'expired' | 'expiring' | 'ok';

// Trunca una fecha a su día en UTC (medianoche). Las caducidades viven en columnas
// `@db.Date` (sin hora), así el cálculo de días no depende de la hora del reloj.
function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Días enteros desde hoy hasta la caducidad (negativo si ya caducó, 0 si caduca
// hoy). Ambas fechas se truncan a día UTC. Función pura, testeable.
export function daysUntil(expiry: Date, today: Date): number {
  return Math.round((startOfDayUtc(expiry) - startOfDayUtc(today)) / MS_PER_DAY);
}

// Clasifica un lote por su caducidad vs hoy y la ventana `withinDays`. Función pura.
export function expiryStatus(expiry: Date, today: Date, withinDays: number): ExpiryStatus {
  const days = daysUntil(expiry, today);
  if (days < 0) {
    return 'expired';
  }
  if (days <= withinDays) {
    return 'expiring';
  }
  return 'ok';
}

// Fecha límite (día UTC, medianoche) del barrido de caducidad: hoy + withinDays
// días. Un lote con expiryDate <= cutoff está caducado o por caducar dentro de la
// ventana → filtro de la query. Función pura.
export function expiryCutoff(today: Date, withinDays: number): Date {
  return new Date(startOfDayUtc(today) + withinDays * MS_PER_DAY);
}
