import type { ReceiveTransferInput, Transfer } from '@simpletpv/auth';

import { api } from './auth.js';

export type { Transfer };

// Traspasos SENT dirigidos a `destStoreId` (los que la tienda debe recibir).
// El backend filtra por tenant; aquí filtramos por la tienda activa.
export async function listIncomingTransfers(destStoreId: string): Promise<Transfer[]> {
  const sent = await api.get<Transfer[]>('/transfers', { status: 'SENT' });
  return sent.filter((t) => t.destStoreId === destStoreId);
}

export function receiveTransfer(id: string, input: ReceiveTransferInput): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/receive`, input);
}
