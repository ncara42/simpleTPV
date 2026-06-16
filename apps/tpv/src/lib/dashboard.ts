import type { SalesTodayResponse } from '@simpletpv/auth';

import { api } from './auth.js';

export type { SalesTodayResponse };

// Recuento diario del TPV (#5): facturación de hoy vs ayer de la tienda activa.
// Usa el endpoint propio del TPV (accesible también al CLERK), distinto del de
// backoffice (`/dashboard/sales-today`, solo ADMIN/MANAGER). El backend acota por
// organización (RLS) y, con storeId, a la tienda activa.
export function getSalesToday(storeId?: string): Promise<SalesTodayResponse> {
  return api.get<SalesTodayResponse>('/tpv/dashboard/sales-today', storeId ? { storeId } : {});
}
