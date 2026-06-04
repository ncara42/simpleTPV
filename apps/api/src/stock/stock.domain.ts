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
