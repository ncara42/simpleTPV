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
