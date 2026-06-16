import {
  ApiError,
  type CashMovement,
  type CashMovementType,
  type CashSession,
  type OpenCashSessionInput,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { CashSession };

export function openCashSession(input: OpenCashSessionInput): Promise<CashSession> {
  return api.post<CashSession>('/cash-sessions/open', input);
}

export function closeCashSession(id: string, countedAmount: number): Promise<CashSession> {
  return api.post<CashSession>(`/cash-sessions/${id}/close`, { countedAmount });
}

export async function currentCashSession(storeId: string): Promise<CashSession | null> {
  try {
    // Sin caja abierta la API responde 200 con body vacío → el cliente devuelve
    // undefined, que TanStack Query rechaza ("Query data cannot be undefined").
    return (await api.get<CashSession | null>('/cash-sessions/current', { storeId })) ?? null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function listCashMovements(cashSessionId: string): Promise<CashMovement[]> {
  return api.get<CashMovement[]>(`/cash-sessions/${cashSessionId}/movements`);
}

// Registro de cierres de caja de la tienda (#145): sesiones CLOSED con su cuadre,
// las más recientes primero. Acotado a la tienda activa en el backend (SEC-01).
export function listClosedCashSessions(storeId: string, limit?: number): Promise<CashSession[]> {
  return api.get<CashSession[]>('/cash-sessions/closed', {
    storeId,
    ...(limit ? { limit: String(limit) } : {}),
  });
}

export function createCashMovement(
  cashSessionId: string,
  input: { type: CashMovementType; amount: number; reason: string },
): Promise<CashMovement> {
  return api.post<CashMovement>(`/cash-sessions/${cashSessionId}/movements`, input);
}
