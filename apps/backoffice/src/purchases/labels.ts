import type { PurchaseOrderStatus } from '@simpletpv/auth';

// Etiqueta legible del estado de un pedido de compra, compartida por las
// secciones de Compras.
export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  PARTIALLY_RECEIVED: 'Parcial',
  RECEIVED: 'Recibido',
};
