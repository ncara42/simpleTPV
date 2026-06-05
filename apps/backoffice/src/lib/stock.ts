import type {
  CreateTransferInput,
  SetMinStockInput,
  StockAlert,
  StockGlobalRow,
  StockMovementsPage,
  Transfer,
} from '@simpletpv/auth';

import { DEMO_ALERTS, DEMO_STOCK_GLOBAL } from '../demo/demoData.js';
import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { StockAlert, StockGlobalRow, Transfer };

// Stock y traspasos (IT-09). adjustStock ya iba a la API; el resto se cablea aquí.
export function getGlobalStock(): Promise<StockGlobalRow[]> {
  if (isDemo()) return Promise.resolve(DEMO_STOCK_GLOBAL);
  return api.get<StockGlobalRow[]>('/stock/global');
}
export function listAlerts(storeId?: string): Promise<StockAlert[]> {
  if (isDemo()) return Promise.resolve(DEMO_ALERTS);
  return api.get<StockAlert[]>('/stock/alerts', { ...(storeId ? { storeId } : {}) });
}
export function setMinStock(input: SetMinStockInput): Promise<unknown> {
  if (isDemo()) return Promise.resolve({ ok: true });
  return api.put<unknown>('/stock/min', input);
}
export function listMovements(productId: string): Promise<StockMovementsPage> {
  if (isDemo()) return Promise.resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 });
  return api.get<StockMovementsPage>('/stock/movements', { productId });
}
export function listTransfers(status?: string): Promise<Transfer[]> {
  if (isDemo()) return Promise.resolve([]);
  return api.get<Transfer[]>('/transfers', { ...(status ? { status } : {}) });
}
export function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  if (isDemo()) return Promise.reject(new Error('no disponible en demo'));
  return api.post<Transfer>('/transfers', input);
}
export function sendTransfer(id: string): Promise<Transfer> {
  if (isDemo()) return Promise.reject(new Error('no disponible en demo'));
  return api.post<Transfer>(`/transfers/${id}/send`);
}

export interface AdjustStockInput {
  productId: string;
  storeId: string;
  newQuantity: number;
  reason: string;
}

export function adjustStock(input: AdjustStockInput): Promise<unknown> {
  if (isDemo()) return Promise.resolve({ ok: true });
  return api.post('/stock/adjust', input);
}
