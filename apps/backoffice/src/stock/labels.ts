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
