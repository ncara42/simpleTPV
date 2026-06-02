import type { ReceiveTransferInput, Transfer } from '@simpletpv/auth';

import { DEMO_TRANSFERS } from '../demo/demoData.js';

export type { Transfer };

export function listIncomingTransfers(_destStoreId: string): Promise<Transfer[]> {
  return Promise.resolve(DEMO_TRANSFERS);
}

export function receiveTransfer(id: string, _input: ReceiveTransferInput): Promise<Transfer> {
  const t = DEMO_TRANSFERS.find((x) => x.id === id) ?? DEMO_TRANSFERS[0]!;
  return Promise.resolve({ ...t, status: 'RECEIVED', receivedAt: '2026-06-02T14:00:00.000Z' });
}
