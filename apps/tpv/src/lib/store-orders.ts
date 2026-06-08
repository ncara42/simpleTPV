import type { ReceiveStoreOrderInput, StoreOrder } from '@simpletpv/auth';

import { api } from './auth.js';

export type { StoreOrder };

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
