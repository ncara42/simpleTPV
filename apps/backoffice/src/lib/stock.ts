import type {
  AdjustStockInput,
  CreateTransferInput,
  ExpiringBatch,
  SetMinStockInput,
  StockAlert,
  StockGlobalRow,
  StockMovementsPage,
  Transfer,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { AdjustStockInput, ExpiringBatch, StockAlert, StockGlobalRow, Transfer };

export function getGlobalStock(): Promise<StockGlobalRow[]> {
  return api.get<StockGlobalRow[]>('/stock/global');
}

export function listAlerts(storeId?: string): Promise<StockAlert[]> {
  return api.get<StockAlert[]>('/stock/alerts', { ...(storeId ? { storeId } : {}) });
}

export function listExpiringBatches(storeId?: string): Promise<ExpiringBatch[]> {
  return api.get<ExpiringBatch[]>('/stock/expiring', { ...(storeId ? { storeId } : {}) });
}

export function setMinStock(input: SetMinStockInput): Promise<unknown> {
  return api.put<unknown>('/stock/min', input);
}

export function listMovements(productId: string): Promise<StockMovementsPage> {
  return api.get<StockMovementsPage>('/stock/movements', { productId });
}

export function listTransfers(status?: string): Promise<Transfer[]> {
  return api.get<Transfer[]>('/transfers', { ...(status ? { status } : {}) });
}

export function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  return api.post<Transfer>('/transfers', input);
}

export function sendTransfer(id: string): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/send`);
}

export function adjustStock(input: AdjustStockInput): Promise<unknown> {
  return api.post('/stock/adjust', input);
}
