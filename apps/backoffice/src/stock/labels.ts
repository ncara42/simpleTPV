import type { StockLevel } from '@simpletpv/auth';

export type Rotation = 'alta' | 'media' | 'baja';

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

export const EXPIRY_LABEL: Record<string, string> = {
  expired: 'Caducado',
  expiring: 'Por caducar',
};

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

export const df = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' });
