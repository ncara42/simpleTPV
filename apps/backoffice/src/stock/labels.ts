import type { StockLevel } from '@simpletpv/auth';

import type { Rotation } from '../demo/demoData.js';

// Etiquetas y formateadores compartidos por las secciones de Stock.

export const ROTATION_LABEL: Record<Rotation, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export const LEVEL_LABEL: Record<StockLevel, string> = {
  red: 'Sin stock',
  yellow: 'Bajo',
  green: 'OK',
};

export const ALERT_LABEL: Record<string, string> = {
  OUT_OF_STOCK: 'Sin stock',
  LOW_STOCK: 'Stock bajo',
};

// Estado de caducidad de un lote (#126 slice 4).
export const EXPIRY_LABEL: Record<string, string> = {
  expired: 'Caducado',
  expiring: 'Por caducar',
};

// Texto relativo a la caducidad a partir de los días restantes (negativo = pasado).
export function expiryDaysText(daysToExpiry: number): string {
  if (daysToExpiry < 0) {
    const d = Math.abs(daysToExpiry);
    return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  }
  if (daysToExpiry === 0) {
    return 'hoy';
  }
  return daysToExpiry === 1 ? 'en 1 día' : `en ${daysToExpiry} días`;
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  RECEIVED: 'Recibido',
  CLOSED: 'Cerrado',
};

export const MOVEMENT_LABEL: Record<string, string> = {
  SALE: 'Venta',
  RETURN: 'Devolución',
  TRANSFER_IN: 'Entrada traspaso',
  TRANSFER_OUT: 'Salida traspaso',
  PURCHASE_RECEIPT: 'Recepción compra',
  ADJUSTMENT: 'Ajuste',
};

export const dt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// Fecha sin hora (p.ej. caducidad de lote, columna @db.Date). UTC para no desplazar
// el día según la zona del navegador.
export const df = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' });
