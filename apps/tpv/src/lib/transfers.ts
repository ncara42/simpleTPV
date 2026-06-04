import type { ReceiveTransferInput, Transfer } from '@simpletpv/auth';

import { DEMO_TRANSFERS } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { Transfer };

// Legacy: traspasos entrantes a la tienda activa (estado SENT, pendientes de recibir).
export async function listIncomingTransfers(destStoreId: string): Promise<Transfer[]> {
  if (isDemo()) return DEMO_TRANSFERS;
  const sent = await api.get<Transfer[]>('/transfers', { status: 'SENT' });
  return sent.filter((t) => t.destStoreId === destStoreId);
}

// Confirma la recepción de un traspaso (cantidades recibidas por línea).
export function receiveTransfer(id: string, input: ReceiveTransferInput): Promise<Transfer> {
  if (isDemo()) {
    const t = DEMO_TRANSFERS.find((x) => x.id === id) ?? DEMO_TRANSFERS[0]!;
    return Promise.resolve({ ...t, status: 'RECEIVED', receivedAt: '2026-06-02T14:00:00.000Z' });
  }
  return api.post<Transfer>(`/transfers/${id}/receive`, input);
}
