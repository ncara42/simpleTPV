import type { CashSession, OpenCashSessionInput } from '@simpletpv/auth';

import { DEMO_CASH_SESSION } from '../demo/demoData.js';

export type { CashSession };

export function openCashSession(_input: OpenCashSessionInput): Promise<CashSession> {
  return Promise.resolve(DEMO_CASH_SESSION);
}

export function closeCashSession(_id: string, countedAmount: number): Promise<CashSession> {
  const expected = Number(DEMO_CASH_SESSION.expectedAmount ?? 0);
  return Promise.resolve({
    ...DEMO_CASH_SESSION,
    status: 'CLOSED',
    closingAmount: countedAmount.toFixed(2),
    difference: (countedAmount - expected).toFixed(2),
    closedAt: '2026-06-02T14:00:00.000Z',
  });
}

export function currentCashSession(_storeId: string): Promise<CashSession | null> {
  return Promise.resolve(DEMO_CASH_SESSION);
}
