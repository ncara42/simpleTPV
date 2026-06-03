import { ApiError, type CashSession, type OpenCashSessionInput } from '@simpletpv/auth';

import { DEMO_CASH_SESSION } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { CashSession };

export function openCashSession(input: OpenCashSessionInput): Promise<CashSession> {
  if (isDemo()) return Promise.resolve(DEMO_CASH_SESSION);
  return api.post<CashSession>('/cash-sessions/open', input);
}

export function closeCashSession(id: string, countedAmount: number): Promise<CashSession> {
  if (isDemo()) {
    const expected = Number(DEMO_CASH_SESSION.expectedAmount ?? 0);
    return Promise.resolve({
      ...DEMO_CASH_SESSION,
      status: 'CLOSED',
      closingAmount: countedAmount.toFixed(2),
      difference: (countedAmount - expected).toFixed(2),
      closedAt: '2026-06-02T14:00:00.000Z',
    });
  }
  return api.post<CashSession>(`/cash-sessions/${id}/close`, { countedAmount });
}

export async function currentCashSession(storeId: string): Promise<CashSession | null> {
  if (isDemo()) return DEMO_CASH_SESSION;
  try {
    return await api.get<CashSession | null>('/cash-sessions/current', { storeId });
  } catch (e) {
    // Sin caja abierta el backend puede responder 404 → no es un error para la UI.
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
