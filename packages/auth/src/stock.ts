import type { StockLevel } from './api-types.js';

/**
 * Deriva el nivel semáforo de stock a partir de la cantidad y el mínimo:
 *   - red:    sin stock (quantity <= 0).
 *   - yellow: en/por debajo del mínimo (0 < quantity <= minStock).
 *   - green:  por encima del mínimo (quantity > minStock).
 *
 * Fuente única para los frontends: espeja la lógica del backend
 * (`apps/api/src/stock/stock.domain.ts`) para que la UI clasifique el stock
 * exactamente igual que el servidor. Pura, testeable.
 */
export function stockLevel(quantity: number, minStock: number): StockLevel {
  if (quantity <= 0) {
    return 'red';
  }
  if (quantity <= minStock) {
    return 'yellow';
  }
  return 'green';
}
