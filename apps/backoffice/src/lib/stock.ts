import type {
  CreateTransferInput,
  SetMinStockInput,
  StockAlert,
  StockGlobalRow,
  StockMovementsPage,
  Transfer,
} from '@simpletpv/auth';

import { DEMO_ALERTS, DEMO_STOCK_GLOBAL } from '../demo/demoData.js';
import { api } from './auth.js';

export type { StockAlert, StockGlobalRow, Transfer };

export function getGlobalStock(): Promise<StockGlobalRow[]> {
  return Promise.resolve(DEMO_STOCK_GLOBAL);
}
export function listAlerts(_storeId?: string): Promise<StockAlert[]> {
  return Promise.resolve(DEMO_ALERTS);
}
export function setMinStock(_input: SetMinStockInput): Promise<unknown> {
  return Promise.resolve({ ok: true });
}
export function listMovements(_productId: string): Promise<StockMovementsPage> {
  return Promise.resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 });
}
export function listTransfers(_status?: string): Promise<Transfer[]> {
  return Promise.resolve([]);
}
export function createTransfer(_input: CreateTransferInput): Promise<Transfer> {
  return Promise.reject(new Error('no disponible en demo'));
}
export function sendTransfer(_id: string): Promise<Transfer> {
  return Promise.reject(new Error('no disponible en demo'));
}

export interface AdjustStockInput {
  productId: string;
  storeId: string;
  newQuantity: number;
  reason: string;
}

export function adjustStock(input: AdjustStockInput): Promise<unknown> {
  return api.post('/stock/adjust', input);
}
