/**
 * Utilidades monetarias compartidas por los servicios que operan con importes
 * en euros (ventas, devoluciones, cuadre de caja, etc.).
 *
 * Centralizar el redondeo evita que cada módulo mantenga su propia copia de
 * `round2` (deuda histórica: estaba triplicado en sales, returns y
 * cash-sessions) y garantiza que TODOS los cálculos usen exactamente la misma
 * semántica de redondeo a céntimos.
 */

/**
 * Redondea a 2 decimales (céntimos).
 *
 * Imprescindible para que el cálculo coincida con la columna `DECIMAL(12,2)` de
 * la base de datos y con el importe que el TPV muestra al cobrar. Sin este
 * redondeo, la imprecisión del float (p.ej. `unitPrice * qty`) puede arrastrarse
 * y divergir del cambio mostrado al cliente.
 *
 * Se suma `Number.EPSILON` antes de multiplicar para corregir casos límite del
 * binario IEE-754 (p.ej. `1.005` que, sin la corrección, redondea a `1.00`).
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza a `number` un valor que puede venir como Decimal (string del driver
 * pg), number, o null/undefined. Cualquier valor no finito cae a 0.
 *
 * Centralizado para no repetir el cast tolerante en cada servicio que lee
 * agregados o columnas DECIMAL (estaba triplicado en dashboard, sales y
 * sales-receipt con variantes sutilmente distintas).
 */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
