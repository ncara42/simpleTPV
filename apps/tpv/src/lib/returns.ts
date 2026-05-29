import type { CreateBlindReturnInput, CreateReturnInput, Return } from '@simpletpv/auth';

import { api } from './auth.js';

export type { CreateBlindReturnInput, CreateReturnInput, Return };

// Crea una devolución parcial contra un ticket.
export function createReturn(input: CreateReturnInput): Promise<Return> {
  return api.post<Return>('/returns', input);
}

// Crea una devolución SIN ticket (#59): requiere PIN de un MANAGER/ADMIN.
export function createBlindReturn(input: CreateBlindReturnInput): Promise<Return> {
  return api.post<Return>('/returns/blind', input);
}

// Devoluciones ya registradas de una venta (para mostrar lo ya devuelto).
export function listReturns(saleId: string): Promise<Return[]> {
  return api.get<Return[]>('/returns', { saleId });
}
