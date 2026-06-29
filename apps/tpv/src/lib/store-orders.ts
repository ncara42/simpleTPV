import type {
  CreateTransferMessageInput,
  ReceiveStoreOrderInput,
  StoreOrder,
  TransferMessage,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { StoreOrder, TransferMessage };

function normalizeOrder(order: StoreOrder): StoreOrder {
  return {
    ...order,
    lines: (order.lines ?? []).map((line) => ({
      ...line,
      storeOrderId:
        line.storeOrderId ?? (line as unknown as { transferId?: string }).transferId ?? order.id,
      productName:
        line.productName ??
        (line as unknown as { product?: { name?: string } }).product?.name ??
        line.productId,
      barcode:
        line.barcode ??
        (line as unknown as { product?: { barcode?: string | null } }).product?.barcode ??
        null,
    })),
  };
}

export async function listIncomingStoreOrders(destStoreId: string): Promise<StoreOrder[]> {
  const sent = await api.get<StoreOrder[]>('/store-orders', { status: 'SENT' });
  return sent.map(normalizeOrder).filter((o) => o.destStoreId === destStoreId);
}

export function receiveStoreOrder(id: string, input: ReceiveStoreOrderInput): Promise<StoreOrder> {
  return api.post<StoreOrder>(`/store-orders/${id}/receive`, input).then(normalizeOrder);
}

// Chat del pedido/traspaso: el dependiente habla con central (texto y/o foto).
export function listStoreOrderMessages(id: string): Promise<TransferMessage[]> {
  return api.get<TransferMessage[]>(`/store-orders/${id}/messages`);
}

export function postStoreOrderMessage(
  id: string,
  input: CreateTransferMessageInput,
): Promise<TransferMessage> {
  return api.post<TransferMessage>(`/store-orders/${id}/messages`, input);
}

// Marca la incidencia de la recepción como solucionada (el hilo se conserva).
export function resolveStoreOrderIncident(id: string): Promise<StoreOrder> {
  return api.post<StoreOrder>(`/store-orders/${id}/resolve-incident`).then(normalizeOrder);
}
