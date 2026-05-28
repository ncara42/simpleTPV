import type {
  CreateTransferInput,
  SetMinStockInput,
  StockAlert,
  StockGlobalRow,
  StockMovementsPage,
  Transfer,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { StockAlert, StockGlobalRow, Transfer };

// Stock global agregado por producto (todas las tiendas + total). Para la vista
// central del backoffice (#33).
export function getGlobalStock(): Promise<StockGlobalRow[]> {
  return api.get<StockGlobalRow[]>('/stock/global');
}

// Alertas activas (por defecto resolved=false), opcionalmente por tienda.
export function listAlerts(storeId?: string): Promise<StockAlert[]> {
  return api.get<StockAlert[]>('/stock/alerts', {
    resolved: 'false',
    storeId: storeId || undefined,
  });
}

export function setMinStock(input: SetMinStockInput): Promise<unknown> {
  return api.put('/stock/min', input);
}

export function listMovements(productId: string): Promise<StockMovementsPage> {
  return api.get<StockMovementsPage>('/stock/movements', { productId });
}

// Traspasos: listado (con filtro de estado), crear y enviar.
export function listTransfers(status?: string): Promise<Transfer[]> {
  return api.get<Transfer[]>('/transfers', { status: status || undefined });
}

export function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  return api.post<Transfer>('/transfers', input);
}

export function sendTransfer(id: string): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/send`);
}
