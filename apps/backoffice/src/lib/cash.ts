import type { CashMovement, PendingCashMovement } from '@simpletpv/auth';

import { api } from './auth.js';

export type { CashMovement, PendingCashMovement };

// Solicitudes de movimiento de efectivo PENDING de la organización (#146): fuente
// de la sección «Aprobaciones de caja» de la campana de notificaciones. Cada fila
// trae el nombre de la tienda y del solicitante.
export function listPendingCashMovements(): Promise<PendingCashMovement[]> {
  return api.get<PendingCashMovement[]>('/cash-sessions/movements/pending');
}

// Aprueba una solicitud PENDING → APPROVED (cuenta en el cuadre de la caja).
export function approveCashMovement(movId: string): Promise<CashMovement> {
  return api.post<CashMovement>(`/cash-sessions/movements/${movId}/approve`, {});
}

// Deniega una solicitud PENDING → DENIED (no cuenta en el cuadre).
export function denyCashMovement(movId: string): Promise<CashMovement> {
  return api.post<CashMovement>(`/cash-sessions/movements/${movId}/deny`, {});
}
