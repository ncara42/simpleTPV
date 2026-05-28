import type { CashSession, CloseCashSessionInput, OpenCashSessionInput } from '@simpletpv/auth';

import { api } from './auth.js';

export type { CashSession };

export function openCashSession(input: OpenCashSessionInput): Promise<CashSession> {
  return api.post<CashSession>('/cash-sessions/open', input);
}

export function closeCashSession(id: string, countedAmount: number): Promise<CashSession> {
  return api.post<CashSession>(`/cash-sessions/${id}/close`, {
    countedAmount,
  } satisfies CloseCashSessionInput);
}

export function currentCashSession(storeId: string): Promise<CashSession | null> {
  return api.get<CashSession | null>('/cash-sessions/current', { storeId });
}
